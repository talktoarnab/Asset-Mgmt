from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from domain.assets import ensure_units_for_asset, persist_stock_fields
from domain import keys
from domain.rules import can_renew, compute_due_at, evaluate_eligibility
from domain.types import borrow_limit_for
from domain.units import first_available_unit
from lib.ddb import client, drop_none, query_all, serialize_item, table, table_name, to_entity
from lib.errors import conflict, not_found, unprocessable
from lib.ids import new_id
from lib.time import end_of_day_after


def _iso(dt: datetime) -> str:
    utc = dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _checkout_item(checkout: dict) -> dict:
    return drop_none(
        {
            "PK": keys.pk(checkout["orgId"]),
            "SK": keys.sk_checkout(checkout["checkoutId"]),
            "entityType": "Checkout",
            "gsi1pk": keys.open_loans_pk(checkout["orgId"]),
            "gsi1sk": keys.open_loans_sk(checkout["dueAt"], checkout["checkoutId"]),
            "gsi3pk": keys.member_history_pk(checkout["orgId"], checkout["memberId"]),
            "gsi3sk": f"CHECKOUT#{checkout['checkoutId']}",
            **checkout,
        }
    )


def _explain_cancellation(error, member, asset, unit=None):
    reasons = error.response.get("CancellationReasons") or []
    unit_reason = reasons[1] if len(reasons) > 1 else {}
    asset_reason = reasons[2] if len(reasons) > 2 else {}
    member_reason = reasons[3] if len(reasons) > 3 else {}
    if unit_reason.get("Code") == "ConditionalCheckFailed":
        serial = (unit or {}).get("serial") or "That unit"
        raise conflict(
            "ASSET_UNAVAILABLE",
            f"{serial} is not on the shelf. Refresh and try again.",
        )
    if asset_reason.get("Code") == "ConditionalCheckFailed":
        raise conflict(
            "ASSET_UNAVAILABLE",
            f'"{asset["title"]}" has no units left on the shelf. Refresh and try again.',
        )
    if member_reason.get("Code") == "ConditionalCheckFailed":
        raise conflict(
            "BORROW_LIMIT_REACHED",
            f"{member['name']} has reached the {borrow_limit_for(member)} item borrowing limit.",
        )
    raise conflict("CHECKOUT_FAILED", "The checkout could not be completed. Please try again.")


def checkout_asset(request: dict) -> dict:
    org, member, actor = request["org"], request["member"], request["actor"]
    now = request.get("now") or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    persist_stock_fields(request["asset"])
    asset = ensure_units_for_asset(request["asset"])
    unit = request.get("unit")
    if not unit:
        unit = first_available_unit(org["orgId"], asset["assetId"])
    if not unit:
        raise unprocessable(
            "CHECKOUT_BLOCKED",
            f'"{asset["title"]}" is out of stock.',
            {"blockers": [{"code": "ASSET_UNAVAILABLE", "message": f'"{asset["title"]}" is out of stock.'}]},
        )

    blockers = evaluate_eligibility(org, member, asset, now, unit=unit)
    if blockers:
        raise unprocessable("CHECKOUT_BLOCKED", blockers[0]["message"], {"blockers": blockers})

    loan_days = request.get("loanDays") or org["defaultLoanDays"]
    checkout = drop_none(
        {
            "orgId": org["orgId"],
            "checkoutId": new_id(),
            "assetId": asset["assetId"],
            "assetCode": asset["code"],
            "assetTitle": asset["title"],
            "unitId": unit["unitId"],
            "unitSerial": unit["serial"],
            "memberId": member["memberId"],
            "memberName": member["name"],
            "memberPhone": member["phone"],
            "status": "open",
            "loanDays": loan_days,
            "checkedOutAt": _iso(now),
            "dueAt": compute_due_at(now, loan_days, org["timezone"]),
            "renewals": 0,
            "checkedOutBy": actor,
            "notes": request.get("notes"),
            "remindersSent": 0,
        }
    )

    try:
        client().transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": table_name(),
                        "Item": serialize_item(_checkout_item(checkout)),
                        "ConditionExpression": "attribute_not_exists(SK)",
                    }
                },
                {
                    "Update": {
                        "TableName": table_name(),
                        "Key": serialize_item(
                            {
                                "PK": keys.pk(org["orgId"]),
                                "SK": keys.sk_unit(asset["assetId"], unit["unitId"]),
                            }
                        ),
                        "UpdateExpression": (
                            "SET #status = :out, currentCheckoutId = :cid, borrowerName = :borrower, updatedAt = :now"
                        ),
                        "ConditionExpression": "attribute_exists(SK) AND #status = :available",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": serialize_item(
                            {
                                ":out": "checked_out",
                                ":available": "available",
                                ":cid": checkout["checkoutId"],
                                ":borrower": member["name"],
                                ":now": checkout["checkedOutAt"],
                            }
                        ),
                    }
                },
                {
                    "Update": {
                        "TableName": table_name(),
                        "Key": serialize_item({"PK": keys.pk(org["orgId"]), "SK": keys.sk_asset(asset["assetId"])}),
                        "UpdateExpression": (
                            "SET updatedAt = :now ADD available :minusOne, timesBorrowed :one"
                        ),
                        "ConditionExpression": "attribute_exists(SK) AND #status = :available AND available > :zero",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": serialize_item(
                            {
                                ":available": "available",
                                ":now": checkout["checkedOutAt"],
                                ":one": 1,
                                ":minusOne": -1,
                                ":zero": 0,
                            }
                        ),
                    }
                },
                {
                    "Update": {
                        "TableName": table_name(),
                        "Key": serialize_item({"PK": keys.pk(org["orgId"]), "SK": keys.sk_member(member["memberId"])}),
                        "UpdateExpression": "SET updatedAt = :now ADD openLoans :one, totalLoans :one",
                        "ConditionExpression": "attribute_exists(SK) AND openLoans < :limit AND #status = :active",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": serialize_item(
                            {
                                ":one": 1,
                                ":limit": borrow_limit_for(member),
                                ":active": "active",
                                ":now": checkout["checkedOutAt"],
                            }
                        ),
                    }
                },
            ]
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "TransactionCanceledException":
            _explain_cancellation(error, member, asset, unit)
        raise
    return checkout


def get_checkout(org_id: str, checkout_id: str) -> dict:
    result = table().get_item(Key={"PK": keys.pk(org_id), "SK": keys.sk_checkout(checkout_id)})
    item = result.get("Item")
    if not item:
        raise not_found("Checkout record not found")
    return to_entity(item)


def close_checkout(checkout: dict, options: dict) -> dict:
    if checkout.get("status") != "open":
        closed = (checkout.get("returnedAt") or checkout.get("markedLostAt") or "")[:10]
        raise conflict("ALREADY_CLOSED", f"This loan was already {checkout.get('status')} on {closed}.")

    now = _iso(options.get("now") or datetime.now(timezone.utc))
    notes_expr = ", notes = :notes " if options.get("notes") else ""
    lost_expr = ", markedLostAt = :now " if options["outcome"] == "lost" else ""
    values = {
        ":status": options["outcome"],
        ":open": "open",
        ":now": now,
        ":actor": options["actor"],
    }
    if options.get("notes"):
        values[":notes"] = options["notes"]

    if options["outcome"] == "returned":
        asset_update = {
            "UpdateExpression": "SET updatedAt = :now ADD available :one",
            "ConditionExpression": "attribute_exists(SK)",
            "ExpressionAttributeValues": serialize_item({":now": now, ":one": 1}),
        }
        unit_values = serialize_item(
            {
                ":available": "available",
                ":out": "checked_out",
                ":now": now,
            }
        )
        unit_update = {
            "UpdateExpression": "SET #status = :available, updatedAt = :now REMOVE currentCheckoutId, borrowerName",
            "ConditionExpression": "attribute_exists(SK) AND #status = :out",
            "ExpressionAttributeNames": {"#status": "status"},
            "ExpressionAttributeValues": unit_values,
        }
    else:
        asset_update = {
            "UpdateExpression": "SET updatedAt = :now ADD stock :minusOne",
            "ConditionExpression": "attribute_exists(SK) AND stock > :zero",
            "ExpressionAttributeValues": serialize_item({":now": now, ":minusOne": -1, ":zero": 0}),
        }
        unit_update = {
            "UpdateExpression": "SET #status = :lost, updatedAt = :now REMOVE currentCheckoutId, borrowerName",
            "ConditionExpression": "attribute_exists(SK) AND #status = :out",
            "ExpressionAttributeNames": {"#status": "status"},
            "ExpressionAttributeValues": serialize_item(
                {":lost": "lost", ":out": "checked_out", ":now": now}
            ),
        }

    items = [
        {
            "Update": {
                "TableName": table_name(),
                "Key": serialize_item(
                    {"PK": keys.pk(checkout["orgId"]), "SK": keys.sk_checkout(checkout["checkoutId"])}
                ),
                "UpdateExpression": (
                    f"SET #status = :status, returnedAt = :now, checkedInBy = :actor "
                    f"{notes_expr}{lost_expr}REMOVE gsi1pk, gsi1sk"
                ),
                "ConditionExpression": "#status = :open",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_item(values),
            }
        }
    ]
    if checkout.get("unitId"):
        items.append(
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": serialize_item(
                        {
                            "PK": keys.pk(checkout["orgId"]),
                            "SK": keys.sk_unit(checkout["assetId"], checkout["unitId"]),
                        }
                    ),
                    **unit_update,
                }
            }
        )
    items.extend(
        [
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": serialize_item(
                        {"PK": keys.pk(checkout["orgId"]), "SK": keys.sk_asset(checkout["assetId"])}
                    ),
                    **asset_update,
                }
            },
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": serialize_item(
                        {"PK": keys.pk(checkout["orgId"]), "SK": keys.sk_member(checkout["memberId"])}
                    ),
                    "UpdateExpression": "SET updatedAt = :now ADD openLoans :minusOne",
                    "ConditionExpression": "openLoans > :zero",
                    "ExpressionAttributeValues": serialize_item({":minusOne": -1, ":zero": 0, ":now": now}),
                }
            },
        ]
    )
    client().transact_write_items(TransactItems=items)
    result = {**checkout, "status": options["outcome"], "returnedAt": now, "checkedInBy": options["actor"]}
    if options["outcome"] == "lost":
        result["markedLostAt"] = now
    return result


def renew_checkout(checkout: dict, org: dict, actor: str, now=None) -> dict:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    blocker = can_renew(checkout, org)
    if blocker:
        raise unprocessable(blocker["code"], blocker["message"])
    due_current = datetime.fromisoformat(checkout["dueAt"].replace("Z", "+00:00"))
    if due_current.tzinfo is None:
        due_current = due_current.replace(tzinfo=timezone.utc)
    base = now if now.timestamp() >= due_current.timestamp() else due_current
    due_at = _iso(end_of_day_after(base, org["renewalDays"], org["timezone"]))

    client().transact_write_items(
        TransactItems=[
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": serialize_item(
                        {"PK": keys.pk(checkout["orgId"]), "SK": keys.sk_checkout(checkout["checkoutId"])}
                    ),
                    "UpdateExpression": (
                        "SET dueAt = :due, gsi1sk = :gsi1sk, remindersSent = :zero, "
                        "renewedBy = :actor REMOVE dueSoonSentAt, lastReminderAt ADD renewals :one"
                    ),
                    "ConditionExpression": "#status = :open",
                    "ExpressionAttributeNames": {"#status": "status"},
                    "ExpressionAttributeValues": serialize_item(
                        {
                            ":due": due_at,
                            ":gsi1sk": keys.open_loans_sk(due_at, checkout["checkoutId"]),
                            ":open": "open",
                            ":one": 1,
                            ":zero": 0,
                            ":actor": actor,
                        }
                    ),
                }
            },
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": serialize_item(
                        {"PK": keys.pk(checkout["orgId"]), "SK": keys.sk_asset(checkout["assetId"])}
                    ),
                    "UpdateExpression": "SET updatedAt = :now",
                    "ExpressionAttributeValues": serialize_item({":now": _iso(now)}),
                }
            },
        ]
    )
    return {**checkout, "dueAt": due_at, "renewals": checkout.get("renewals", 0) + 1, "remindersSent": 0}


def list_open_loans_for_asset(org_id: str, asset_id: str) -> list:
    return [loan for loan in list_open_loans(org_id) if loan.get("assetId") == asset_id]


def list_open_loans_for_unit(org_id: str, unit_id: str) -> list:
    return [loan for loan in list_open_loans(org_id) if loan.get("unitId") == unit_id]


def list_open_loans(org_id: str, due_before: str | None = None) -> list:
    expr = Key("gsi1pk").eq(keys.open_loans_pk(org_id))
    if due_before:
        expr = expr & Key("gsi1sk").lt(due_before)
    return query_all({"IndexName": keys.GSI1, "KeyConditionExpression": expr, "ScanIndexForward": True})


def list_member_history(org_id: str, member_id: str) -> list:
    return query_all(
        {
            "IndexName": keys.GSI3,
            "KeyConditionExpression": Key("gsi3pk").eq(keys.member_history_pk(org_id, member_id)),
            "ScanIndexForward": False,
        }
    )


def list_recent_checkouts(org_id: str, limit=100) -> list:
    return query_all(
        {
            "KeyConditionExpression": Key("PK").eq(keys.pk(org_id)) & Key("SK").begins_with(keys.PREFIX_CHECKOUT),
            "ScanIndexForward": False,
        },
        limit,
    )
