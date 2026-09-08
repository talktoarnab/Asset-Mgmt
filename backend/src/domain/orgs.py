from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from domain import keys
from lib import env
from lib.auth import hash_pin
from lib.ddb import drop_none, query_all, table, to_entity
from lib.errors import conflict, not_found

ORG_DEFAULTS = {
    "timezone": "Asia/Kolkata",
    "defaultCountryCode": "+91",
    "defaultLoanDays": 14,
    "maxRenewals": 2,
    "renewalDays": 7,
    "reminderChannel": "auto",
    "dueSoonLeadDays": 1,
    "overdueReminderIntervalDays": 3,
    "maxOverdueReminders": 4,
}

MUTABLE_FIELDS = [
    "name",
    "timezone",
    "defaultCountryCode",
    "defaultLoanDays",
    "maxRenewals",
    "renewalDays",
    "reminderChannel",
    "dueSoonLeadDays",
    "overdueReminderIntervalDays",
    "maxOverdueReminders",
    "contactPhone",
]

SECRET_FIELDS = {"pinHash"}
RESERVED_SLUGS = {
    "api",
    "v1",
    "orgs",
    "auth",
    "www",
    "admin",
    "settings",
    "login",
    "me",
    "new",
    "assets",
    "members",
    "desk",
}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _item(org: dict) -> dict:
    return drop_none(
        {
            "PK": keys.pk(org["orgId"]),
            "SK": keys.sk_org(),
            "entityType": "Org",
            "gsi2pk": keys.ORG_REGISTRY_PK,
            "gsi2sk": f"ORG#{org['orgId']}",
            **org,
        }
    )


def public_org(org: dict) -> dict:
    out = {k: v for k, v in org.items() if k not in SECRET_FIELDS}
    out["slug"] = org.get("orgId")
    return out


def get_org(org_id: str) -> dict:
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_org()})
    item = result.get("Item")
    if not item:
        raise not_found(f"Organization {org_id} has not been set up yet")
    return to_entity(item)


def find_org(org_id: str):
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_org()})
    item = result.get("Item")
    return to_entity(item) if item else None


def require_org(org_id: str) -> dict:
    org = find_org(org_id)
    if org:
        return org
    if org_id == env.org_id():
        return ensure_org(org_id, env.org_name())
    raise not_found(f"Organization {org_id} has not been set up yet")


def ensure_org(org_id: str, fallback_name: str | None = None) -> dict:
    existing = find_org(org_id)
    if existing:
        return existing
    now = _now()
    org = {
        "orgId": org_id,
        "name": fallback_name or "My Library",
        **ORG_DEFAULTS,
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        table().put_item(Item=_item(org), ConditionExpression="attribute_not_exists(PK)")
    except ClientError:
        return get_org(org_id)
    return org


def create_org(slug: str, name: str, pin: str) -> dict:
    org_id = slug.strip().lower()
    if org_id in RESERVED_SLUGS:
        raise conflict("RESERVED_SLUG", f'"{org_id}" is reserved. Choose another branch ID.')
    now = _now()
    org = {
        "orgId": org_id,
        "name": name.strip(),
        "pinHash": hash_pin(pin),
        **ORG_DEFAULTS,
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        table().put_item(Item=_item(org), ConditionExpression="attribute_not_exists(PK)")
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise conflict("ORG_EXISTS", f'Branch "{org_id}" is already taken.') from None
        raise
    return org


def set_org_pin(org_id: str, pin: str) -> dict:
    result = table().update_item(
        Key={"PK": keys.pk(org_id), "SK": keys.sk_org()},
        UpdateExpression="SET pinHash = :pin, updatedAt = :now",
        ExpressionAttributeValues={":pin": hash_pin(pin), ":now": _now()},
        ConditionExpression="attribute_exists(PK)",
        ReturnValues="ALL_NEW",
    )
    return to_entity(result.get("Attributes") or {})


def list_orgs() -> list:
    return query_all(
        {
            "IndexName": keys.GSI2,
            "KeyConditionExpression": Key("gsi2pk").eq(keys.ORG_REGISTRY_PK),
        }
    )


def update_org(org_id: str, patch: dict) -> dict:
    names = {"#updatedAt": "updatedAt"}
    values = {":updatedAt": _now()}
    sets = ["#updatedAt = :updatedAt"]
    for field in MUTABLE_FIELDS:
        if field not in patch or patch[field] is None:
            continue
        names[f"#{field}"] = field
        values[f":{field}"] = patch[field]
        sets.append(f"#{field} = :{field}")
    result = table().update_item(
        Key={"PK": keys.pk(org_id), "SK": keys.sk_org()},
        UpdateExpression=f"SET {', '.join(sets)}",
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ConditionExpression="attribute_exists(PK)",
        ReturnValues="ALL_NEW",
    )
    return to_entity(result.get("Attributes") or {})
