from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from domain import keys
from lib.ddb import drop_none, query_all, table, to_entity
from lib.errors import conflict, not_found
from lib.ids import new_id
from lib.phone import normalize_phone


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _item(member: dict) -> dict:
    return drop_none(
        {
            "PK": keys.pk(member["orgId"]),
            "SK": keys.sk_member(member["memberId"]),
            "entityType": "Member",
            "gsi2pk": keys.phone_lookup_pk(member["orgId"], member["phone"]),
            "gsi2sk": f"MEMBER#{member['memberId']}",
            **member,
        }
    )


def list_members(org_id: str) -> list:
    items = query_all(
        {
            "KeyConditionExpression": Key("PK").eq(keys.pk(org_id)) & Key("SK").begins_with(keys.PREFIX_MEMBER),
        }
    )
    return sorted(items, key=lambda m: m.get("name", ""))


def get_member(org_id: str, member_id: str) -> dict:
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_member(member_id)})
    item = result.get("Item")
    if not item:
        raise not_found("Member not found")
    return to_entity(item)


def find_member_by_phone(org_id: str, phone: str):
    items = query_all(
        {
            "IndexName": keys.GSI2,
            "KeyConditionExpression": Key("gsi2pk").eq(keys.phone_lookup_pk(org_id, phone)),
        }
    )
    return items[0] if items else None


def create_member(org_id: str, input_data: dict, default_country_code: str) -> dict:
    phone = normalize_phone(input_data["phone"], default_country_code)
    existing = find_member_by_phone(org_id, phone)
    if existing:
        raise conflict(
            "DUPLICATE_PHONE",
            f"{existing['name']} is already registered with {phone}.",
            {"memberId": existing["memberId"]},
        )
    now = _now()
    member = drop_none(
        {
            "orgId": org_id,
            "memberId": new_id(),
            "name": input_data["name"].strip(),
            "phone": phone,
            "email": (input_data.get("email") or "").strip() or None,
            "tier": input_data.get("tier") or "standard",
            "borrowLimit": input_data.get("borrowLimit"),
            "status": input_data.get("status") or "active",
            "whatsappOptIn": True if input_data.get("whatsappOptIn") is None else input_data.get("whatsappOptIn"),
            "membershipExpiresAt": input_data.get("membershipExpiresAt"),
            "notes": input_data.get("notes"),
            "openLoans": 0,
            "totalLoans": 0,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    table().put_item(Item=_item(member), ConditionExpression="attribute_not_exists(SK)")
    return member


def update_member(org_id: str, member_id: str, patch: dict, default_country_code: str) -> dict:
    current = get_member(org_id, member_id)
    phone = normalize_phone(patch["phone"], default_country_code) if patch.get("phone") else current["phone"]
    if phone != current["phone"]:
        clash = find_member_by_phone(org_id, phone)
        if clash and clash["memberId"] != member_id:
            raise conflict("DUPLICATE_PHONE", f"{clash['name']} already uses {phone}.")
    next_member = {**current, **{k: v for k, v in patch.items() if v is not None}}
    if patch.get("email") == "":
        next_member.pop("email", None)
    next_member.update(
        {
            "phone": phone,
            "orgId": org_id,
            "memberId": member_id,
            "openLoans": current.get("openLoans", 0),
            "totalLoans": current.get("totalLoans", 0),
            "createdAt": current["createdAt"],
            "updatedAt": _now(),
        }
    )
    table().put_item(Item=_item(next_member))
    return next_member


def delete_member(org_id: str, member_id: str) -> None:
    member = get_member(org_id, member_id)
    if member.get("openLoans", 0) > 0:
        raise conflict(
            "MEMBER_HAS_LOANS",
            f"{member['name']} still has {member['openLoans']} item(s) checked out. Check them in first.",
        )
    table().delete_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_member(member_id)})


def set_open_loan_count(org_id: str, member_id: str, open_loans: int) -> None:
    table().update_item(
        Key={"PK": keys.pk(org_id), "SK": keys.sk_member(member_id)},
        UpdateExpression="SET openLoans = :n, updatedAt = :now",
        ExpressionAttributeValues={":n": open_loans, ":now": _now()},
        ConditionExpression="attribute_exists(SK)",
    )
