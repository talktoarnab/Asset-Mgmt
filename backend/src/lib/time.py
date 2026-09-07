from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def timezone_offset_ms(dt: datetime, time_zone: str) -> int:
    utc = _as_utc(dt)
    local = utc.astimezone(ZoneInfo(time_zone))
    offset = local.utcoffset()
    return int((offset or timedelta(0)).total_seconds() * 1000)


def zoned_date_key(dt: datetime, time_zone: str) -> str:
    return _as_utc(dt).astimezone(ZoneInfo(time_zone)).strftime("%Y-%m-%d")


def from_zoned_parts(time_zone: str, year: int, month: int, day: int, hour=0, minute=0, second=0) -> datetime:
    local = datetime(year, month, day, hour, minute, second, tzinfo=ZoneInfo(time_zone))
    return local.astimezone(timezone.utc)


def end_of_day_after(from_dt: datetime, days: int, time_zone: str) -> datetime:
    year, month, day = (int(p) for p in zoned_date_key(from_dt, time_zone).split("-"))
    rolled = datetime(year, month, day, tzinfo=timezone.utc) + timedelta(days=days)
    return from_zoned_parts(
        time_zone,
        rolled.year,
        rolled.month,
        rolled.day,
        23,
        59,
        59,
    )


def days_between(from_dt: datetime, to_dt: datetime) -> int:
    return int((_as_utc(to_dt) - _as_utc(from_dt)).total_seconds() // 86_400)


def add_days(dt: datetime, days: int) -> datetime:
    return _as_utc(dt) + timedelta(days=days)


def is_valid_time_zone(time_zone: str) -> bool:
    try:
        ZoneInfo(time_zone)
        return True
    except (ZoneInfoNotFoundError, KeyError, Exception):
        return False


def calendar_days_between(from_dt: datetime, to_dt: datetime, time_zone: str) -> int:
    start = from_zoned_parts(time_zone, *(int(p) for p in zoned_date_key(from_dt, time_zone).split("-")))
    end = from_zoned_parts(time_zone, *(int(p) for p in zoned_date_key(to_dt, time_zone).split("-")))
    return round((end.timestamp() - start.timestamp()) / 86_400)


def describe_due(due_at: str, now: datetime, time_zone: str) -> str:
    diff = calendar_days_between(now, datetime.fromisoformat(due_at.replace("Z", "+00:00")), time_zone)
    if diff == 0:
        return "due today"
    if diff == 1:
        return "due tomorrow"
    if diff > 1:
        return f"due in {diff} days"
    if diff == -1:
        return "overdue by 1 day"
    return f"overdue by {abs(diff)} days"
