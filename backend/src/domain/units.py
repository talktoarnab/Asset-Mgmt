from datetime import datetime, timezone
import re

from boto3.dynamodb.conditions import Key

from domain import keys
from lib.ddb import drop_none, query_all, table, to_entity
from lib.errors import conflict, not_found
from lib.ids import new_id

UNIT_STATUSES = {"available", "checked_out", "lost", "maintenance", "retired"}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _item(unit: dict) -> dict:
    return drop_none(
        {
            "PK": keys.pk(unit["orgId"]),
            "SK": keys.sk_unit(unit["assetId"], unit["unitId"]),
            "entityType": "Unit",
            "gsi2pk": keys.unit_serial_lookup_pk(unit["orgId"], unit["serial"]),
            "gsi2sk": f"UNIT#{unit['unitId']}",
            **unit,
        }
    )


def allocate_serials(sku: str, existing: list[str], count: int) -> list[str]:
    used = {serial.upper() for serial in existing}
    prefix = (sku or "AS").upper()
    taken = set()
    for serial in used:
        match = re.fullmatch(re.escape(prefix) + r"-(\d+)", serial)
        if match:
            taken.add(int(match.group(1)))
    n = 1
    result = []
    while len(result) < count:
        if n not in taken:
            result.append(f"{prefix}-{n:03d}")
        n += 1
        if n > 100_000:
            break
    return result


def list_units(org_id: str, asset_id: str) -> list:
    items = query_all(
        {
            "KeyConditionExpression": Key("PK").eq(keys.pk(org_id))
            & Key("SK").begins_with(f"{keys.PREFIX_UNIT}{asset_id}#"),
        }
    )
    return sorted(items, key=lambda unit: unit.get("serial", ""))


def get_unit(org_id: str, asset_id: str, unit_id: str) -> dict:
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_unit(asset_id, unit_id)})
    item = result.get("Item")
    if not item:
        raise not_found("Stock unit not found")
    return to_entity(item)


def find_unit_by_serial(org_id: str, serial: str):
    items = query_all(
        {
            "IndexName": keys.GSI2,
            "KeyConditionExpression": Key("gsi2pk").eq(keys.unit_serial_lookup_pk(org_id, serial)),
        }
    )
    return items[0] if items else None


def create_units(
    org_id: str,
    asset: dict,
    count: int,
    serials: list[str] | None = None,
    status: str = "available",
) -> list:
    if count < 1:
        return []
    if status not in UNIT_STATUSES:
        status = "available"
    existing = [unit["serial"] for unit in list_units(org_id, asset["assetId"])]
    assigned = [s.strip().upper() for s in (serials or []) if s and str(s).strip()]
    if len(assigned) > count:
        assigned = assigned[:count]
    if len(assigned) < count:
        assigned.extend(
            allocate_serials(asset.get("sku") or asset.get("code"), existing + assigned, count - len(assigned))
        )
    now = _now()
    created = []
    seen = {serial.upper() for serial in existing}
    for serial in assigned:
        if serial in seen or find_unit_by_serial(org_id, serial):
            raise conflict("DUPLICATE_SERIAL", f"Serial {serial} is already on the floor.")
        seen.add(serial)
        unit = drop_none(
            {
                "orgId": org_id,
                "assetId": asset["assetId"],
                "assetCode": asset.get("sku") or asset.get("code"),
                "assetTitle": asset.get("title"),
                "unitId": new_id(),
                "serial": serial,
                "status": status,
                "condition": asset.get("condition") or "good",
                "createdAt": now,
                "updatedAt": now,
            }
        )
        table().put_item(Item=_item(unit), ConditionExpression="attribute_not_exists(SK)")
        created.append(unit)
    return created


def update_unit(org_id: str, asset_id: str, unit_id: str, patch: dict) -> dict:
    current = get_unit(org_id, asset_id, unit_id)
    if patch.get("serial") and patch["serial"].upper() != current["serial"]:
        clash = find_unit_by_serial(org_id, patch["serial"])
        if clash and clash["unitId"] != unit_id:
            raise conflict("DUPLICATE_SERIAL", f'Serial {patch["serial"].upper()} is already in use.')
    if patch.get("status") and current.get("status") == "checked_out" and patch["status"] != "checked_out":
        raise conflict("UNIT_ON_LOAN", f'{current["serial"]} is out on loan. Check it in first.')
    next_unit = {**current, **{k: v for k, v in patch.items() if v is not None}}
    next_unit.update(
        {
            "serial": patch["serial"].upper() if patch.get("serial") else current["serial"],
            "orgId": org_id,
            "assetId": asset_id,
            "unitId": unit_id,
            "createdAt": current["createdAt"],
            "updatedAt": _now(),
        }
    )
    table().put_item(Item=_item(next_unit))
    return next_unit


def delete_unit(org_id: str, asset_id: str, unit_id: str) -> dict:
    unit = get_unit(org_id, asset_id, unit_id)
    if unit.get("status") == "checked_out":
        raise conflict("UNIT_ON_LOAN", f'{unit["serial"]} is out on loan and cannot be removed.')
    table().delete_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_unit(asset_id, unit_id)})
    return unit


def first_available_unit(org_id: str, asset_id: str):
    for unit in list_units(org_id, asset_id):
        if unit.get("status") == "available":
            return unit
    return None


def counts_from_units(units: list) -> dict:
    circulating = [u for u in units if u.get("status") in ("available", "checked_out", "maintenance")]
    available = sum(1 for u in circulating if u.get("status") == "available")
    on_loan = sum(1 for u in circulating if u.get("status") == "checked_out")
    lost = sum(1 for u in units if u.get("status") == "lost")
    return {"stock": len(circulating), "available": available, "unitsOnLoan": on_loan, "lostUnits": lost}
