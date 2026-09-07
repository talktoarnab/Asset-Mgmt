from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from domain import keys
from domain.rules import can_renew, compute_due_at, evaluate_eligibility
from domain.types import borrow_limit_for
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


def _explain_cancellation(error, member, asset):
    reasons = error.response.get("CancellationReasons") or []
    asset_reason = reasons[1] if len(reasons) > 1 else {}
    member_reason = reasons[2] if len(reasons) > 2 else {}
    if asset_reason.get("Code") == "ConditionalCheckFailed":
        raise conflict(
            "ASSET_UNAVAILABLE",
            f'"{asset["title"]}" was just taken by someone else. Refresh and try again.',
        )
    if member_reason.get("Code") == "ConditionalCheckFailed":
        raise conflict(
            "BORROW_LIMIT_REACHED",
            f"{member['name']} has reached the {borrow_limit_for(member)} item borrowing limit.",
        )
    raise conflict("CHECKOUT_FAILED", "The checkout could not be completed. Please try again.")


def checkout_asset(request: dict) -> dict:
    org, member, asset, actor = request["org"], request["member"], request["asset"], request["actor"]
    now = request.get("now") or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    blockers = evaluate_eligibility(org, member, asset, now)
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
                        "Key": serialize_item({"PK": keys.pk(org["orgId"]), "SK": keys.sk_asset(asset["assetId"])}),
                        "UpdateExpression": (
                            "SET #status = :checkedOut, activeCheckoutId = :cid, activeMemberId = :mid, "
                            "activeMemberName = :mname, dueAt = :due, updatedAt = :now ADD timesBorrowed :one"
                        ),
                        "ConditionExpression": "attribute_exists(SK) AND #status = :available",
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": serialize_item(
                            {
                                ":checkedOut": "checked_out",
                                ":available": "available",
                                ":cid": checkout["checkoutId"],
                                ":mid": member["memberId"],
                                ":mname": member["name"],
                                ":due": checkout["dueAt"],
                                ":now": checkout["checkedOutAt"],
                                ":one": 1,
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
            _explain_cancellation(error, member, asset)
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
    asset_status = "available" if options["outcome"] == "returned" else "lost"
    notes_expr = ", notes = :notes " if options.get("notes") else ""
    lost_expr = ", markedLostAt = :now " if options["outcome"] == "lost" else ""
    condition_name = {**( {"#condition": "condition"} if options.get("condition") else {} )}
    condition_set = ", #condition = :condition" if options.get("condition") else ""

    values = {
        ":status": options["outcome"],
        ":open": "open",
        ":now": now,
        ":actor": options["actor"],
    }
    if options.get("notes"):
        values[":notes"] = options["notes"]

    asset_values = {":assetStatus": asset_status, ":now": now}
    if options.get("condition"):
        asset_values[":condition"] = options["condition"]

    client().transact_write_items(
        TransactItems=[
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
            },
            {
                "Update": {
                    "TableName": table_name(),
                    "Key": serialize_item(
                        {"PK": keys.pk(checkout["orgId"]), "SK": keys.sk_asset(checkout["assetId"])}
                    ),
                    "UpdateExpression": (
                        f"SET #status = :assetStatus, updatedAt = :now{condition_set} "
                        "REMOVE activeCheckoutId, activeMemberId, activeMemberName, dueAt"
                    ),
                    "ExpressionAttributeNames": {"#status": "status", **condition_name},
                    "ExpressionAttributeValues": serialize_item(asset_values),
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
                    "UpdateExpression": "SET dueAt = :due, updatedAt = :now",
                    "ExpressionAttributeValues": serialize_item({":due": due_at, ":now": _iso(now)}),
                }
            },
        ]
    )
    return {**checkout, "dueAt": due_at, "renewals": checkout.get("renewals", 0) + 1, "remindersSent": 0}


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
