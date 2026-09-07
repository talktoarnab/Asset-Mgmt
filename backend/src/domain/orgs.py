from datetime import datetime, timezone

from botocore.exceptions import ClientError

from domain import keys
from lib.ddb import drop_none, table, to_entity
from lib.errors import not_found

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


def get_org(org_id: str) -> dict:
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_org()})
    item = result.get("Item")
    if not item:
        raise not_found(f"Organization {org_id} has not been set up yet")
    return to_entity(item)


def ensure_org(org_id: str, fallback_name: str | None = None) -> dict:
    try:
        return get_org(org_id)
    except Exception as error:
        if "has not been set up" not in str(error):
            raise
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
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


def update_org(org_id: str, patch: dict) -> dict:
    names = {"#updatedAt": "updatedAt"}
    values = {":updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")}
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
