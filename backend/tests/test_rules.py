from datetime import datetime, timezone

from domain.rules import can_renew, compute_due_at, evaluate_eligibility, is_overdue, select_reminders
from factories import make_asset, make_checkout, make_member, make_org

now = datetime(2026, 3, 10, 9, 0, 0, tzinfo=timezone.utc)


def test_allows_when_some_units_are_out():
    blockers = evaluate_eligibility(
        make_org(), make_member(), make_asset(stock=5, available=2), now
    )
    assert blockers == []
    blockers = evaluate_eligibility(make_org(), make_member(openLoans=1), make_asset(), now)
    assert blockers == []


def test_blocks_at_tier_limit():
    blockers = evaluate_eligibility(make_org(), make_member(tier="standard", openLoans=3), make_asset(), now)
    assert "BORROW_LIMIT_REACHED" in [b["code"] for b in blockers]
    assert "3 of 3" in blockers[0]["message"]


def test_honours_override():
    blockers = evaluate_eligibility(
        make_org(), make_member(tier="basic", borrowLimit=5, openLoans=4), make_asset(), now
    )
    assert blockers == []


def test_blocks_when_out_of_stock():
    blockers = evaluate_eligibility(
        make_org(),
        make_member(),
        make_asset(stock=3, available=0),
        now,
    )
    assert blockers[0]["code"] == "ASSET_UNAVAILABLE"
    assert "out of stock" in blockers[0]["message"]


def test_reports_every_problem():
    blockers = evaluate_eligibility(
        make_org(),
        make_member(status="suspended", openLoans=9, membershipExpiresAt="2026-01-01T00:00:00.000Z"),
        make_asset(status="maintenance"),
        now,
    )
    assert sorted(b["code"] for b in blockers) == [
        "ASSET_UNAVAILABLE",
        "BORROW_LIMIT_REACHED",
        "MEMBERSHIP_EXPIRED",
        "MEMBER_SUSPENDED",
    ]


def test_due_at_end_of_nth_day():
    assert compute_due_at(now, 3, "Asia/Kolkata") == "2026-03-13T18:29:59.000Z"


def test_late_evening_loan_not_shortened():
    late = datetime(2026, 3, 10, 18, 0, 0, tzinfo=timezone.utc)
    assert compute_due_at(late, 1, "Asia/Kolkata") == "2026-03-11T18:29:59.000Z"


def test_dst_zone():
    due = compute_due_at(datetime(2026, 3, 6, 12, tzinfo=timezone.utc), 10, "America/New_York")
    assert due.startswith("2026-03-17")


def test_not_overdue_on_due_day():
    assert is_overdue(make_checkout(dueAt="2026-03-10T18:29:59.000Z"), now) is False


def test_returned_not_overdue():
    assert is_overdue(make_checkout(status="returned", dueAt="2026-01-01T00:00:00.000Z"), now) is False


def test_overdue_after_due():
    assert is_overdue(make_checkout(dueAt="2026-03-09T18:29:59.000Z"), now) is True


def test_due_soon_nudge():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    checkout = make_checkout(dueAt="2026-03-11T18:29:59.000Z")
    assert select_reminders([checkout], org, now) == [{"checkout": checkout, "kind": "due_soon", "daysOverdue": 0}]


def test_no_repeat_pre_due():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    checkout = make_checkout(dueAt="2026-03-11T18:29:59.000Z", dueSoonSentAt="2026-03-09T14:00:00.000Z")
    assert select_reminders([checkout], org, now) == []


def test_quiet_when_not_due():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    assert select_reminders([make_checkout(dueAt="2026-03-20T18:29:59.000Z")], org, now) == []


def test_overdue_days_late():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    checkout = make_checkout(dueAt="2026-03-04T18:29:59.000Z")
    decision = select_reminders([checkout], org, now)[0]
    assert decision["kind"] == "overdue"
    assert decision["daysOverdue"] == 6


def test_respects_gap():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    checkout = make_checkout(dueAt="2026-03-01T18:29:59.000Z", lastReminderAt="2026-03-09T09:00:00.000Z", remindersSent=1)
    assert select_reminders([checkout], org, now) == []


def test_sends_after_gap():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    checkout = make_checkout(dueAt="2026-03-01T18:29:59.000Z", lastReminderAt="2026-03-06T09:00:00.000Z", remindersSent=1)
    assert len(select_reminders([checkout], org, now)) == 1


def test_cap():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    checkout = make_checkout(dueAt="2026-01-01T18:29:59.000Z", lastReminderAt="2026-02-01T09:00:00.000Z", remindersSent=4)
    assert select_reminders([checkout], org, now) == []


def test_ignores_closed():
    org = make_org(dueSoonLeadDays=1, overdueReminderIntervalDays=3, maxOverdueReminders=4)
    assert select_reminders([make_checkout(status="returned", dueAt="2026-01-01T18:29:59.000Z")], org, now) == []


def test_can_renew_below_limit():
    assert can_renew(make_checkout(renewals=1), make_org(maxRenewals=2)) is None


def test_renewal_limit():
    assert can_renew(make_checkout(renewals=2), make_org(maxRenewals=2))["code"] == "RENEWAL_LIMIT"


def test_cannot_renew_closed():
    assert can_renew(make_checkout(status="returned"), make_org())["code"] == "NOT_OPEN"
