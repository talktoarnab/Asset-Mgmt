from datetime import datetime, timedelta, timezone

from lib.time import calendar_days_between, zoned_date_key

LONG_OVERDUE_DAYS = 30


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def build_summary(org, assets, members, open_loans, recent_checkouts, now=None):
    now = _utc(now or datetime.now(timezone.utc))

    def by_status(status):
        return sum(1 for a in assets if a.get("status") == status)

    total = len(assets)
    checked_out = by_status("checked_out")
    overdue = due_today = due_soon = long_overdue = value_at_risk = 0
    asset_by_id = {a["assetId"]: a for a in assets}

    for loan in open_loans:
        due = datetime.fromisoformat(loan["dueAt"].replace("Z", "+00:00"))
        days = calendar_days_between(now, due, org["timezone"])
        due_utc = _utc(due)
        if due_utc < now:
            overdue += 1
            if abs(days) >= LONG_OVERDUE_DAYS:
                long_overdue += 1
                value_at_risk += asset_by_id.get(loan["assetId"], {}).get("replacementCost") or 0
        elif days == 0:
            due_today += 1
        elif days <= 3:
            due_soon += 1

    lost_assets = [a for a in assets if a.get("status") == "lost"]
    value_at_risk += sum(a.get("replacementCost") or 0 for a in lost_assets)

    cutoff = now - timedelta(days=30)
    in_window = [
        c for c in recent_checkouts if _utc(datetime.fromisoformat(c["checkedOutAt"].replace("Z", "+00:00"))) >= cutoff
    ]

    return {
        "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        if now.microsecond == 0
        else now.isoformat().replace("+00:00", "Z"),
        "assets": {
            "total": total,
            "available": by_status("available"),
            "checkedOut": checked_out,
            "lost": len(lost_assets),
            "maintenance": by_status("maintenance"),
            "utilisationPct": 0 if total == 0 else round((checked_out / total) * 100),
        },
        "members": {
            "total": len(members),
            "active": sum(1 for m in members if m.get("status") == "active"),
            "suspended": sum(1 for m in members if m.get("status") == "suspended"),
            "atLimit": sum(
                1 for m in members if m.get("openLoans", 0) > 0 and m.get("openLoans", 0) >= (m.get("borrowLimit") or 99)
            ),
        },
        "loans": {
            "open": len(open_loans),
            "overdue": overdue,
            "dueToday": due_today,
            "dueSoon": due_soon,
            "returnedLast30Days": sum(
                1
                for c in recent_checkouts
                if c.get("returnedAt")
                and _utc(datetime.fromisoformat(c["returnedAt"].replace("Z", "+00:00"))) >= cutoff
                and c.get("status") == "returned"
            ),
            "checkoutsLast30Days": len(in_window),
        },
        "shrinkage": {"lostAssets": len(lost_assets), "valueAtRisk": value_at_risk, "longOverdue": long_overdue},
    }


def build_report(org, assets, members, open_loans, recent_checkouts, now=None):
    now = _utc(now or datetime.now(timezone.utc))
    summary = build_summary(org, assets, members, open_loans, recent_checkouts, now)

    most_borrowed = sorted(
        [a for a in assets if a.get("timesBorrowed", 0) > 0],
        key=lambda a: a.get("timesBorrowed", 0),
        reverse=True,
    )[:10]
    top_borrowers = sorted(
        [m for m in members if m.get("totalLoans", 0) > 0],
        key=lambda m: m.get("totalLoans", 0),
        reverse=True,
    )[:10]

    category_map = {}
    for asset in assets:
        entry = category_map.setdefault(asset["category"], {"total": 0, "checkedOut": 0})
        entry["total"] += 1
        if asset.get("status") == "checked_out":
            entry["checkedOut"] += 1

    activity = {}
    for i in range(29, -1, -1):
        key = zoned_date_key(now - timedelta(days=i), org["timezone"])
        activity[key] = {"checkouts": 0, "returns": 0}
    for checkout in recent_checkouts:
        out_day = zoned_date_key(datetime.fromisoformat(checkout["checkedOutAt"].replace("Z", "+00:00")), org["timezone"])
        if out_day in activity:
            activity[out_day]["checkouts"] += 1
        if checkout.get("returnedAt"):
            in_day = zoned_date_key(
                datetime.fromisoformat(checkout["returnedAt"].replace("Z", "+00:00")), org["timezone"]
            )
            if in_day in activity:
                activity[in_day]["returns"] += 1

    return {
        **summary,
        "mostBorrowed": [
            {"assetId": a["assetId"], "title": a["title"], "code": a["code"], "timesBorrowed": a["timesBorrowed"]}
            for a in most_borrowed
        ],
        "topBorrowers": [
            {"memberId": m["memberId"], "name": m["name"], "totalLoans": m["totalLoans"], "openLoans": m["openLoans"]}
            for m in top_borrowers
        ],
        "categories": sorted(
            [{"category": k, **v} for k, v in category_map.items()],
            key=lambda row: row["total"],
            reverse=True,
        ),
        "activityByDay": [{"date": d, **v} for d, v in activity.items()],
        "neverBorrowed": [
            {"assetId": a["assetId"], "title": a["title"], "code": a["code"]}
            for a in assets
            if a.get("timesBorrowed", 0) == 0
        ][:25],
    }
