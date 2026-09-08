from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from domain import keys
from domain.types import stock_levels, with_stock
from lib.ddb import drop_none, query_all, table, to_entity
from lib.errors import conflict, not_found
from lib.ids import new_asset_code, new_id

CODE_PREFIXES = {"book": "BK", "equipment": "EQ", "tool": "TL", "media": "MD", "device": "DV"}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _item(asset: dict) -> dict:
    return drop_none(
        {
            "PK": keys.pk(asset["orgId"]),
            "SK": keys.sk_asset(asset["assetId"]),
            "entityType": "Asset",
            "gsi2pk": keys.asset_code_lookup_pk(asset["orgId"], asset["code"]),
            "gsi2sk": f"ASSET#{asset['assetId']}",
            **asset,
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


def resolve_asset_ref(org_id: str, ref: str) -> dict:
    trimmed = (ref or "").strip()
    if not trimmed:
        raise not_found("No asset reference supplied")
    import re

    from_url = re.search(r"/a/([^/?#]+)", trimmed)
    candidate = from_url.group(1) if from_url else trimmed
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
    return with_stock(asset)


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
    current_stock, current_available = stock_levels(current)
    on_loan = current_stock - current_available
    next_stock = int(patch["stock"]) if patch.get("stock") is not None else current_stock
    if next_stock < on_loan:
        raise conflict(
            "STOCK_BELOW_LOANS",
            f"{on_loan} unit(s) are out on loan. Stock cannot be lower than that.",
        )
    next_asset = {**current, **{k: v for k, v in patch.items() if v is not None}}
    next_asset.update(
        {
            "code": patch["code"].upper() if patch.get("code") else current["code"],
            "sku": patch["code"].upper() if patch.get("code") else current.get("sku") or current["code"],
            "stock": next_stock,
            "available": next_stock - on_loan,
            "orgId": org_id,
            "assetId": asset_id,
            "createdAt": current["createdAt"],
            "updatedAt": _now(),
        }
    )
    next_asset.pop("unitsOnLoan", None)
    table().put_item(Item=_item(next_asset))
    return with_stock(next_asset)


def delete_asset(org_id: str, asset_id: str) -> None:
    asset = get_asset(org_id, asset_id)
    if asset.get("unitsOnLoan", 0) > 0:
        raise conflict(
            "ASSET_ON_LOAN",
            f'"{asset["title"]}" still has {asset["unitsOnLoan"]} unit(s) on loan and cannot be deleted.',
        )
    table().delete_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_asset(asset_id)})
