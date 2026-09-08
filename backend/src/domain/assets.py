from datetime import datetime, timezone
import re

from boto3.dynamodb.conditions import Key

from domain import keys
from domain.types import stock_levels, with_stock
from domain.units import (
    counts_from_units,
    create_units,
    delete_unit,
    find_unit_by_serial,
    get_unit,
    list_units,
    update_unit,
)
from lib.ddb import drop_none, query_all, table, to_entity
from lib.errors import conflict, not_found
from lib.ids import new_asset_code, new_id

CODE_PREFIXES = {"book": "BK", "equipment": "EQ", "tool": "TL", "media": "MD", "device": "DV"}
TRANSIENT_FIELDS = {"units", "unitsOnLoan", "lostUnits"}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _item(asset: dict) -> dict:
    persistable = {k: v for k, v in asset.items() if k not in TRANSIENT_FIELDS}
    return drop_none(
        {
            "PK": keys.pk(persistable["orgId"]),
            "SK": keys.sk_asset(persistable["assetId"]),
            "entityType": "Asset",
            "gsi2pk": keys.asset_code_lookup_pk(persistable["orgId"], persistable["code"]),
            "gsi2sk": f"ASSET#{persistable['assetId']}",
            **persistable,
        }
    )


def list_assets(org_id: str) -> list:
    items = query_all(
        {
            "KeyConditionExpression": Key("PK").eq(keys.pk(org_id)) & Key("SK").begins_with(keys.PREFIX_ASSET),
        }
    )
    return sorted((with_stock(a) for a in items), key=lambda a: a.get("title", ""))


def get_asset(org_id: str, asset_id: str) -> dict:
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_asset(asset_id)})
    item = result.get("Item")
    if not item:
        raise not_found("Asset not found")
    return with_stock(to_entity(item))


def find_asset_by_code(org_id: str, code: str):
    items = query_all(
        {
            "IndexName": keys.GSI2,
            "KeyConditionExpression": Key("gsi2pk").eq(keys.asset_code_lookup_pk(org_id, code)),
        }
    )
    return with_stock(items[0]) if items else None


def parse_ref(ref: str) -> str:
    trimmed = (ref or "").strip()
    if not trimmed:
        raise not_found("No asset reference supplied")
    from_url = re.search(r"/a/([^/?#]+)", trimmed)
    return from_url.group(1) if from_url else trimmed


def resolve_scan(org_id: str, ref: str) -> tuple[dict, dict | None]:
    candidate = parse_ref(ref)
    unit = find_unit_by_serial(org_id, candidate)
    if unit:
        return get_asset(org_id, unit["assetId"]), unit
    return resolve_asset_ref(org_id, candidate), None


def resolve_asset_ref(org_id: str, ref: str) -> dict:
    candidate = parse_ref(ref)
    unit = find_unit_by_serial(org_id, candidate)
    if unit:
        return get_asset(org_id, unit["assetId"])
    if "-" in candidate:
        by_code = find_asset_by_code(org_id, candidate)
        if by_code:
            return by_code
    try:
        return get_asset(org_id, candidate)
    except Exception:
        by_code = find_asset_by_code(org_id, candidate)
        if by_code:
            return by_code
        raise not_found(f'No asset matches "{ref}" in this branch') from None


def write_stock_counts(org_id: str, asset_id: str, units: list | None = None) -> dict:
    units = units if units is not None else list_units(org_id, asset_id)
    counts = counts_from_units(units)
    table().update_item(
        Key={"PK": keys.pk(org_id), "SK": keys.sk_asset(asset_id)},
        UpdateExpression="SET stock = :s, available = :a, updatedAt = :now",
        ExpressionAttributeValues={":s": counts["stock"], ":a": counts["available"], ":now": _now()},
    )
    return counts


def attach_units(asset: dict, units: list | None = None) -> dict:
    units = units if units is not None else list_units(asset["orgId"], asset["assetId"])
    counts = counts_from_units(units)
    return {**with_stock({**asset, "stock": counts["stock"], "available": counts["available"]}), **counts, "units": units}


def ensure_units_for_asset(asset: dict) -> dict:
    org_id, asset_id = asset["orgId"], asset["assetId"]
    units = list_units(org_id, asset_id)
    if units:
        return attach_units(asset, units)
    persist_stock_fields(asset)
    stock, available = stock_levels(asset)
    if stock < 1:
        return {**with_stock(asset), "units": []}
    on_loan = max(0, stock - available)
    created = []
    if available:
        created.extend(create_units(org_id, asset, available, status="available"))
    if on_loan:
        created.extend(create_units(org_id, asset, on_loan, status="checked_out"))
    write_stock_counts(org_id, asset_id, created)
    return attach_units(asset, created)


def get_asset_detail(org_id: str, asset_id: str) -> dict:
    return ensure_units_for_asset(get_asset(org_id, asset_id))


def persist_stock_fields(asset: dict) -> dict:
    """Write stock/available if an older unique-copy row is missing them."""
    if asset.get("stock") is not None and asset.get("available") is not None:
        return with_stock(asset)
    stock, available = stock_levels(asset)
    table().update_item(
        Key={"PK": keys.pk(asset["orgId"]), "SK": keys.sk_asset(asset["assetId"])},
        UpdateExpression="SET stock = if_not_exists(stock, :s), available = if_not_exists(available, :a)",
        ExpressionAttributeValues={":s": stock, ":a": available},
    )
    return with_stock({**asset, "stock": stock, "available": available})


def create_asset(org_id: str, input_data: dict) -> dict:
    category = (input_data.get("category") or "book").strip() or "book"
    code = ((input_data.get("code") or "").strip() or new_asset_code(CODE_PREFIXES.get(category, "AS"))).upper()
    clash = find_asset_by_code(org_id, code)
    if clash:
        raise conflict("DUPLICATE_CODE", f'Label code {code} is already used by "{clash["title"]}".')
    now = _now()
    stock = int(input_data["stock"]) if input_data.get("stock") is not None else 1
    asset = drop_none(
        {
            "orgId": org_id,
            "assetId": new_id(),
            "code": code,
            "sku": code,
            "title": input_data["title"].strip(),
            "category": category,
            "creator": (input_data.get("creator") or "").strip() or None,
            "identifier": (input_data.get("identifier") or "").strip() or None,
            "location": (input_data.get("location") or "").strip() or None,
            "condition": input_data.get("condition") or "good",
            "replacementCost": input_data.get("replacementCost"),
            "tags": input_data.get("tags"),
            "status": input_data.get("status") or "available",
            "stock": stock,
            "available": stock,
            "timesBorrowed": 0,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    table().put_item(Item=_item(asset), ConditionExpression="attribute_not_exists(SK)")
    units = create_units(org_id, asset, stock)
    return attach_units(asset, units)


def update_asset(org_id: str, asset_id: str, patch: dict) -> dict:
    current = get_asset(org_id, asset_id)
    if patch.get("code") and patch["code"].upper() != current["code"]:
        clash = find_asset_by_code(org_id, patch["code"])
        if clash and clash["assetId"] != asset_id:
            raise conflict("DUPLICATE_CODE", f'Label code {patch["code"]} is already in use.')
    if patch.get("status") and current.get("unitsOnLoan", 0) > 0 and patch["status"] not in ("available", "checked_out"):
        raise conflict(
            "ASSET_ON_LOAN",
            f'"{current["title"]}" still has {current["unitsOnLoan"]} unit(s) on loan. Check them in first.',
        )
    current = ensure_units_for_asset(current)
    units = list(current.get("units") or [])
    current_stock, current_available = stock_levels(current)
    on_loan = current_stock - current_available
    next_stock = int(patch["stock"]) if patch.get("stock") is not None else current_stock
    if next_stock < on_loan:
        raise conflict(
            "STOCK_BELOW_LOANS",
            f"{on_loan} unit(s) are out on loan. Stock cannot be lower than that.",
        )
    if patch.get("stock") is not None and next_stock != current_stock:
        if next_stock > current_stock:
            units.extend(create_units(org_id, current, next_stock - current_stock))
        else:
            removable = [unit for unit in units if unit.get("status") == "available"]
            need = current_stock - next_stock
            if len(removable) < need:
                raise conflict(
                    "STOCK_BELOW_LOANS",
                    f"Only {len(removable)} unit(s) are on the shelf. Check in or retire the rest first.",
                )
            for unit in reversed(removable)[:need]:
                delete_unit(org_id, asset_id, unit["unitId"])
            units = list_units(org_id, asset_id)
    counts = counts_from_units(units)
    next_asset = {**current, **{k: v for k, v in patch.items() if v is not None}}
    next_asset.update(
        {
            "code": patch["code"].upper() if patch.get("code") else current["code"],
            "sku": patch["code"].upper() if patch.get("code") else current.get("sku") or current["code"],
            "stock": counts["stock"],
            "available": counts["available"],
            "orgId": org_id,
            "assetId": asset_id,
            "createdAt": current["createdAt"],
            "updatedAt": _now(),
        }
    )
    next_asset.pop("unitsOnLoan", None)
    next_asset.pop("lostUnits", None)
    next_asset.pop("units", None)
    table().put_item(Item=_item(next_asset))
    if patch.get("title") or patch.get("code"):
        for unit in list_units(org_id, asset_id):
            table().update_item(
                Key={"PK": keys.pk(org_id), "SK": keys.sk_unit(asset_id, unit["unitId"])},
                UpdateExpression="SET assetTitle = :title, assetCode = :code",
                ExpressionAttributeValues={":title": next_asset["title"], ":code": next_asset["code"]},
            )
    return attach_units(next_asset)


def delete_asset(org_id: str, asset_id: str) -> None:
    asset = get_asset(org_id, asset_id)
    if asset.get("unitsOnLoan", 0) > 0:
        raise conflict(
            "ASSET_ON_LOAN",
            f'"{asset["title"]}" still has {asset["unitsOnLoan"]} unit(s) on loan and cannot be deleted.',
        )
    for unit in list_units(org_id, asset_id):
        delete_unit(org_id, asset_id, unit["unitId"])
    table().delete_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_asset(asset_id)})


def add_units_to_asset(org_id: str, asset_id: str, count: int, serials: list[str] | None = None) -> dict:
    asset = get_asset(org_id, asset_id)
    create_units(org_id, asset, count, serials)
    write_stock_counts(org_id, asset_id)
    return get_asset_detail(org_id, asset_id)


def patch_unit_on_asset(org_id: str, asset_id: str, unit_id: str, patch: dict) -> dict:
    get_asset(org_id, asset_id)
    if patch.get("status") == "checked_out":
        raise conflict("UNIT_ON_LOAN", "Check the unit out from the desk instead of editing its status.")
    update_unit(org_id, asset_id, unit_id, patch)
    write_stock_counts(org_id, asset_id)
    return get_asset_detail(org_id, asset_id)


def remove_unit_from_asset(org_id: str, asset_id: str, unit_id: str) -> dict:
    get_asset(org_id, asset_id)
    unit = get_unit(org_id, asset_id, unit_id)
    remaining = [item for item in list_units(org_id, asset_id) if item["unitId"] != unit_id]
    if unit.get("status") in ("available", "maintenance") and counts_from_units(remaining)["stock"] < 1:
        raise conflict("LAST_UNIT", "Keep at least one unit, or delete the catalogue item.")
    delete_unit(org_id, asset_id, unit_id)
    write_stock_counts(org_id, asset_id)
    return get_asset_detail(org_id, asset_id)
