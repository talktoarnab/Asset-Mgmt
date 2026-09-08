from datetime import datetime, timezone

from domain.types import borrow_limit_for, stock_levels
from lib.time import calendar_days_between, end_of_day_after


def evaluate_eligibility(org, member, asset, now: datetime, unit=None):
    blockers = []
    if member.get("status") == "suspended":
        blockers.append({"code": "MEMBER_SUSPENDED", "message": f"{member['name']}'s membership is suspended."})
    expires = member.get("membershipExpiresAt")
    if expires and datetime.fromisoformat(expires.replace("Z", "+00:00")) < now:
        blockers.append(
            {
                "code": "MEMBERSHIP_EXPIRED",
                "message": f"{member['name']}'s membership expired on {expires[:10]}.",
            }
        )
    limit = borrow_limit_for(member)
    if member.get("openLoans", 0) >= limit:
        blockers.append(
            {
                "code": "BORROW_LIMIT_REACHED",
                "message": f"{member['name']} already has {member.get('openLoans', 0)} of {limit} items out.",
            }
        )
    status = asset.get("status")
    if status not in (None, "available", "checked_out"):
        blockers.append(
            {
                "code": "ASSET_UNAVAILABLE",
                "message": f"\"{asset['title']}\" is marked {str(status).replace('_', ' ')}.",
            }
        )
    else:
        if unit is not None:
            status = unit.get("status")
            serial = unit.get("serial") or "This unit"
            if status != "available":
                blockers.append(
                    {
                        "code": "ASSET_UNAVAILABLE",
                        "message": f"{serial} is {str(status or 'unavailable').replace('_', ' ')}.",
                    }
                )
        else:
            _stock, available = stock_levels(asset)
            if available < 1:
                blockers.append(
                    {
                        "code": "ASSET_UNAVAILABLE",
                        "message": f'"{asset["title"]}" is out of stock.',
                    }
                )
    _ = org
    return blockers


def compute_due_at(now: datetime, loan_days: int, time_zone: str) -> str:
    due = end_of_day_after(now, loan_days, time_zone).astimezone(timezone.utc)
    return due.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def is_overdue(checkout, now: datetime) -> bool:
    due = datetime.fromisoformat(checkout["dueAt"].replace("Z", "+00:00"))
    if due.tzinfo is None:
        from datetime import timezone

        due = due.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        from datetime import timezone

        now = now.replace(tzinfo=timezone.utc)
    return checkout.get("status") == "open" and due < now


def select_reminders(checkouts, org, now: datetime):
    decisions = []
    for checkout in checkouts:
        if checkout.get("status") != "open":
            continue
        due = datetime.fromisoformat(checkout["dueAt"].replace("Z", "+00:00"))
        days_until_due = calendar_days_between(now, due, org["timezone"])
        if due.tzinfo is None:
            from datetime import timezone

            due = due.replace(tzinfo=timezone.utc)
        cmp_now = now
        if cmp_now.tzinfo is None:
            from datetime import timezone

            cmp_now = cmp_now.replace(tzinfo=timezone.utc)
        if due < cmp_now:
            if checkout.get("remindersSent", 0) >= org["maxOverdueReminders"]:
                continue
            if checkout.get("lastReminderAt"):
                last = datetime.fromisoformat(checkout["lastReminderAt"].replace("Z", "+00:00"))
                since_last = calendar_days_between(last, now, org["timezone"])
                if since_last < org["overdueReminderIntervalDays"]:
                    continue
            decisions.append({"checkout": checkout, "kind": "overdue", "daysOverdue": abs(days_until_due)})
            continue
        if days_until_due <= org["dueSoonLeadDays"] and not checkout.get("dueSoonSentAt"):
            decisions.append({"checkout": checkout, "kind": "due_soon", "daysOverdue": 0})
    return decisions


def can_renew(checkout, org):
    if checkout.get("status") != "open":
        return {"code": "NOT_OPEN", "message": "Only an active loan can be renewed."}
    if checkout.get("renewals", 0) >= org["maxRenewals"]:
        return {
            "code": "RENEWAL_LIMIT",
            "message": f"This loan has already been renewed {checkout.get('renewals', 0)} time(s), the branch limit.",
        }
    return None
