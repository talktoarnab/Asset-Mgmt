from datetime import datetime, timezone

from domain.analytics import build_report, build_summary
from factories import make_asset, make_checkout, make_member, make_org

now = datetime(2026, 3, 10, 9, 0, 0, tzinfo=timezone.utc)
org = make_org()

assets = [
    make_asset(assetId="a1", title="Sapiens", timesBorrowed=9, status="checked_out"),
    make_asset(assetId="a2", title="Clean Code", timesBorrowed=4, status="checked_out"),
    make_asset(assetId="a3", title="Drill", category="tool", timesBorrowed=2),
    make_asset(assetId="a4", title="Projector", category="equipment", timesBorrowed=0),
    make_asset(assetId="a5", title="Camera", category="equipment", status="lost", replacementCost=38000, timesBorrowed=3),
]

members = [
    make_member(memberId="m1", name="Ananya", openLoans=1, totalLoans=12),
    make_member(memberId="m2", name="Rohit", openLoans=1, totalLoans=5),
    make_member(memberId="m3", name="Meera", status="suspended", totalLoans=0),
]

open_loans = [
    make_checkout(checkoutId="c1", assetId="a1", memberId="m1", dueAt="2026-03-10T18:29:59Z"),
    make_checkout(checkoutId="c2", assetId="a2", memberId="m2", dueAt="2026-01-20T18:29:59Z"),
]


def test_catalogue_counts():
    summary = build_summary(org, assets, members, open_loans, open_loans, now)
    assert summary["assets"]["total"] == 5
    assert summary["assets"]["available"] == 2
    assert summary["assets"]["checkedOut"] == 2
    assert summary["assets"]["lost"] == 1
    assert summary["assets"]["utilisationPct"] == 40


def test_due_today_vs_overdue():
    summary = build_summary(org, assets, members, open_loans, open_loans, now)
    assert summary["loans"]["dueToday"] == 1
    assert summary["loans"]["overdue"] == 1


def test_value_at_risk():
    summary = build_summary(org, assets, members, open_loans, open_loans, now)
    assert summary["shrinkage"]["longOverdue"] == 1
    assert summary["shrinkage"]["lostAssets"] == 1
    assert summary["shrinkage"]["valueAtRisk"] == 38000


def test_member_standing():
    summary = build_summary(org, assets, members, open_loans, open_loans, now)
    assert summary["members"]["total"] == 3
    assert summary["members"]["active"] == 2
    assert summary["members"]["suspended"] == 1


def test_empty_branch():
    empty = build_summary(org, [], [], [], [], now)
    assert empty["assets"]["utilisationPct"] == 0
    assert empty["loans"]["open"] == 0


def test_most_borrowed():
    report = build_report(org, assets, members, open_loans, open_loans, now)
    assert [a["title"] for a in report["mostBorrowed"]] == ["Sapiens", "Clean Code", "Camera", "Drill"]


def test_top_borrowers():
    report = build_report(org, assets, members, open_loans, open_loans, now)
    assert report["topBorrowers"][0]["name"] == "Ananya"
    assert report["topBorrowers"][0]["totalLoans"] == 12


def test_categories():
    report = build_report(org, assets, members, open_loans, open_loans, now)
    equipment = next(c for c in report["categories"] if c["category"] == "equipment")
    assert equipment == {"category": "equipment", "total": 2, "checkedOut": 0}


def test_never_borrowed():
    report = build_report(org, assets, members, open_loans, open_loans, now)
    assert [a["title"] for a in report["neverBorrowed"]] == ["Projector"]


def test_activity_window():
    report = build_report(org, assets, members, open_loans, open_loans, now)
    assert len(report["activityByDay"]) == 30
    assert report["activityByDay"][-1]["date"] == "2026-03-10"
    assert all(isinstance(d["checkouts"], int) for d in report["activityByDay"])
