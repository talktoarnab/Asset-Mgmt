from datetime import datetime, timezone

from lib.time import (
    calendar_days_between,
    describe_due,
    end_of_day_after,
    from_zoned_parts,
    is_valid_time_zone,
    timezone_offset_ms,
    zoned_date_key,
)


def test_fixed_offset():
    assert timezone_offset_ms(datetime(2026, 3, 10, tzinfo=timezone.utc), "Asia/Kolkata") == int(5.5 * 3_600_000)


def test_dst():
    winter = timezone_offset_ms(datetime(2026, 1, 15, 12, tzinfo=timezone.utc), "America/New_York")
    summer = timezone_offset_ms(datetime(2026, 7, 15, 12, tzinfo=timezone.utc), "America/New_York")
    assert winter == -5 * 3_600_000
    assert summer == -4 * 3_600_000


def test_zoned_date_key_rolls():
    assert zoned_date_key(datetime(2026, 3, 10, 19, tzinfo=timezone.utc), "Asia/Kolkata") == "2026-03-11"
    assert zoned_date_key(datetime(2026, 3, 10, 18, tzinfo=timezone.utc), "Asia/Kolkata") == "2026-03-10"


def test_from_zoned_parts_round_trip():
    assert from_zoned_parts("Asia/Kolkata", 2026, 3, 11, 0, 0, 0).strftime("%Y-%m-%dT%H:%M:%S.000Z") == "2026-03-10T18:30:00.000Z"


def test_spring_forward():
    instant = from_zoned_parts("America/New_York", 2026, 3, 8, 12, 0, 0)
    assert instant.strftime("%Y-%m-%dT%H:%M:%S.000Z") == "2026-03-08T16:00:00.000Z"


def test_end_of_today():
    assert (
        end_of_day_after(datetime(2026, 3, 10, 9, tzinfo=timezone.utc), 0, "Asia/Kolkata").strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        == "2026-03-10T18:29:59.000Z"
    )


def test_end_of_day_month_boundary():
    assert (
        end_of_day_after(datetime(2026, 3, 28, 9, tzinfo=timezone.utc), 5, "Asia/Kolkata").strftime(
            "%Y-%m-%dT%H:%M:%S.000Z"
        )
        == "2026-04-02T18:29:59.000Z"
    )


def test_calendar_days_night_crossing():
    assert (
        calendar_days_between(
            datetime(2026, 3, 10, 17, 30, tzinfo=timezone.utc),
            datetime(2026, 3, 10, 19, 30, tzinfo=timezone.utc),
            "Asia/Kolkata",
        )
        == 1
    )


def test_calendar_days_negative():
    assert (
        calendar_days_between(
            datetime(2026, 3, 10, 9, tzinfo=timezone.utc),
            datetime(2026, 3, 5, 9, tzinfo=timezone.utc),
            "Asia/Kolkata",
        )
        == -5
    )


def test_describe_due():
    now = datetime(2026, 3, 10, 9, tzinfo=timezone.utc)
    cases = [
        ("2026-03-10T18:29:59.000Z", "due today"),
        ("2026-03-11T18:29:59.000Z", "due tomorrow"),
        ("2026-03-15T18:29:59.000Z", "due in 5 days"),
        ("2026-03-09T18:29:59.000Z", "overdue by 1 day"),
        ("2026-03-01T18:29:59.000Z", "overdue by 9 days"),
    ]
    for due_at, expected in cases:
        assert describe_due(due_at, now, "Asia/Kolkata") == expected


def test_timezone_validity():
    assert is_valid_time_zone("Asia/Kolkata") is True
    assert is_valid_time_zone("Asia/Kolkat") is False
