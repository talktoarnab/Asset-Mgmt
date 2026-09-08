import re

from lib.errors import ValidationError
from lib.time import is_valid_time_zone

TIERS = {"basic", "standard", "premium", "staff"}
MEMBER_STATUSES = {"active", "suspended"}
ASSET_STATUSES = {"available", "lost", "maintenance", "retired"}
REMINDER_CHANNELS = {"whatsapp", "sms", "auto"}


def _issue(field, message):
    return {"field": field, "message": message}


def _str(data, field, errors, *, required=False, min_len=1, max_len=None, trim=True):
    if field not in data or data[field] is None:
        if required:
            errors.append(_issue(field, "Required"))
        return None
    value = data[field]
    if not isinstance(value, str):
        errors.append(_issue(field, "Must be a string"))
        return None
    if trim:
        value = value.strip()
    if required and len(value) < min_len:
        errors.append(_issue(field, "Required"))
        return value
    if max_len is not None and len(value) > max_len:
        errors.append(_issue(field, f"Must be at most {max_len} characters"))
    return value


def _opt_str(data, field, errors, max_len=None):
    if field not in data or data[field] in (None, ""):
        return None
    return _str(data, field, errors, max_len=max_len)


def _num(data, field, errors, *, integer=False, min_v=None, max_v=None):
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        errors.append(_issue(field, "Must be a number"))
        return None
    if integer and not isinstance(value, int):
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        else:
            errors.append(_issue(field, "Must be a whole number"))
            return None
    if min_v is not None and value < min_v:
        errors.append(_issue(field, f"Must be at least {min_v}"))
    if max_v is not None and value > max_v:
        errors.append(_issue(field, f"Must be at most {max_v}"))
    return value


def _bool(data, field, errors):
    if field not in data or data[field] is None:
        return None
    if not isinstance(data[field], bool):
        errors.append(_issue(field, "Must be true or false"))
        return None
    return data[field]


def _enum(data, field, allowed, errors):
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if value not in allowed:
        errors.append(_issue(field, f"Must be one of {', '.join(sorted(allowed))}"))
        return None
    return value


def _raise(errors):
    if errors:
        raise ValidationError(errors)


def member_create(data: dict) -> dict:
    errors = []
    out = {
        "name": _str(data, "name", errors, required=True, max_len=120),
        "phone": _str(data, "phone", errors, required=True, max_len=24),
        "email": _opt_str(data, "email", errors, max_len=160),
        "tier": _enum(data, "tier", TIERS, errors),
        "borrowLimit": _num(data, "borrowLimit", errors, integer=True, min_v=0, max_v=100),
        "status": _enum(data, "status", MEMBER_STATUSES, errors),
        "whatsappOptIn": _bool(data, "whatsappOptIn", errors),
        "membershipExpiresAt": _opt_str(data, "membershipExpiresAt", errors),
        "notes": _opt_str(data, "notes", errors, max_len=1000),
    }
    if out.get("email"):
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", out["email"]):
            errors.append(_issue("email", "Invalid email"))
    _raise(errors)
    return {k: v for k, v in out.items() if v is not None}


def member_update(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValidationError([_issue("", "Invalid body")])
    # reuse create then drop missing keys that were not sent
    errors = []
    out = {}
    if "name" in data:
        out["name"] = _str(data, "name", errors, required=True, max_len=120)
    if "phone" in data:
        out["phone"] = _str(data, "phone", errors, required=True, max_len=24)
    if "email" in data:
        out["email"] = _opt_str(data, "email", errors, max_len=160) or ""
    if "tier" in data:
        out["tier"] = _enum(data, "tier", TIERS, errors)
    if "borrowLimit" in data:
        out["borrowLimit"] = _num(data, "borrowLimit", errors, integer=True, min_v=0, max_v=100)
    if "status" in data:
        out["status"] = _enum(data, "status", MEMBER_STATUSES, errors)
    if "whatsappOptIn" in data:
        out["whatsappOptIn"] = _bool(data, "whatsappOptIn", errors)
    if "membershipExpiresAt" in data:
        out["membershipExpiresAt"] = _opt_str(data, "membershipExpiresAt", errors)
    if "notes" in data:
        out["notes"] = _opt_str(data, "notes", errors, max_len=1000)
    _raise(errors)
    return out


def asset_create(data: dict) -> dict:
    errors = []
    sku = _opt_str(data, "sku", errors, max_len=32)
    code = _opt_str(data, "code", errors, max_len=32) or sku
    if code and not re.match(r"^[A-Za-z0-9-]{3,32}$", code):
        errors.append(_issue("code", "Use letters, numbers and dashes only"))
    out = {
        "title": _str(data, "title", errors, required=True, max_len=200),
        "category": _opt_str(data, "category", errors, max_len=40),
        "code": code,
        "creator": _opt_str(data, "creator", errors, max_len=160),
        "identifier": _opt_str(data, "identifier", errors, max_len=80),
        "location": _opt_str(data, "location", errors, max_len=80),
        "condition": _opt_str(data, "condition", errors, max_len=40),
        "replacementCost": _num(data, "replacementCost", errors, min_v=0, max_v=10_000_000),
        "status": _enum(data, "status", ASSET_STATUSES, errors),
        "stock": _num(data, "stock", errors, integer=True, min_v=1, max_v=100_000),
    }
    tags = data.get("tags")
    if tags is not None:
        if not isinstance(tags, list) or len(tags) > 20:
            errors.append(_issue("tags", "Invalid tags"))
        else:
            out["tags"] = [str(t).strip() for t in tags]
    _raise(errors)
    return {k: v for k, v in out.items() if v is not None}


def asset_update(data: dict) -> dict:
    errors = []
    out = {}
    mapping = [
        ("title", lambda: _str(data, "title", errors, required=True, max_len=200)),
        ("category", lambda: _opt_str(data, "category", errors, max_len=40)),
        ("code", lambda: _opt_str(data, "code", errors, max_len=32)),
        ("creator", lambda: _opt_str(data, "creator", errors, max_len=160)),
        ("identifier", lambda: _opt_str(data, "identifier", errors, max_len=80)),
        ("location", lambda: _opt_str(data, "location", errors, max_len=80)),
        ("condition", lambda: _opt_str(data, "condition", errors, max_len=40)),
        ("replacementCost", lambda: _num(data, "replacementCost", errors, min_v=0, max_v=10_000_000)),
        ("status", lambda: _enum(data, "status", ASSET_STATUSES, errors)),
        ("stock", lambda: _num(data, "stock", errors, integer=True, min_v=1, max_v=100_000)),
    ]
    for key, fn in mapping:
        if key in data:
            out[key] = fn()
    if "sku" in data and "code" not in data:
        out["code"] = _opt_str(data, "sku", errors, max_len=32)
    if out.get("code") and not re.match(r"^[A-Za-z0-9-]{3,32}$", out["code"]):
        errors.append(_issue("code", "Use letters, numbers and dashes only"))
    _raise(errors)
    return out


def asset_bulk(data: dict) -> dict:
    errors = []
    assets = data.get("assets")
    if not isinstance(assets, list) or not (1 <= len(assets) <= 100):
        raise ValidationError([_issue("assets", "Provide between 1 and 100 items")])
    parsed = [asset_create(row) for row in assets]
    _raise(errors)
    return {"assets": parsed}


def checkout_create(data: dict) -> dict:
    errors = []
    out = {
        "assetRef": _str(data, "assetRef", errors, required=True, max_len=300),
        "memberId": _str(data, "memberId", errors, required=True, max_len=64),
        "loanDays": _num(data, "loanDays", errors, integer=True, min_v=1, max_v=365),
        "notes": _opt_str(data, "notes", errors, max_len=500),
    }
    _raise(errors)
    return {k: v for k, v in out.items() if v is not None}


def checkin(data: dict) -> dict:
    if not data:
        return {}
    errors = []
    out = {
        "condition": _opt_str(data, "condition", errors, max_len=40),
        "notes": _opt_str(data, "notes", errors, max_len=500),
    }
    _raise(errors)
    return {k: v for k, v in out.items() if v is not None}


def checkin_by_ref(data: dict) -> dict:
    errors = []
    out = {
        "assetRef": _str(data, "assetRef", errors, required=True, max_len=300),
        **checkin(data),
    }
    _raise(errors)
    return out


def scan(data: dict) -> dict:
    errors = []
    out = {
        "ref": _str(data, "ref", errors, required=True, max_len=300),
        "memberId": _opt_str(data, "memberId", errors, max_len=64),
    }
    _raise(errors)
    return {k: v for k, v in out.items() if v is not None}


def settings(data: dict) -> dict:
    errors = []
    out = {}
    if "name" in data:
        out["name"] = _str(data, "name", errors, required=True, max_len=120)
    if "timezone" in data:
        tz = _str(data, "timezone", errors, required=True)
        if tz and not is_valid_time_zone(tz):
            errors.append(_issue("timezone", "Not a recognised timezone"))
        out["timezone"] = tz
    if "defaultCountryCode" in data:
        cc = _str(data, "defaultCountryCode", errors, required=True)
        if cc and not re.match(r"^\+\d{1,4}$", cc):
            errors.append(_issue("defaultCountryCode", "Use a form like +91"))
        out["defaultCountryCode"] = cc
    if "defaultLoanDays" in data:
        out["defaultLoanDays"] = _num(data, "defaultLoanDays", errors, integer=True, min_v=1, max_v=365)
    if "maxRenewals" in data:
        out["maxRenewals"] = _num(data, "maxRenewals", errors, integer=True, min_v=0, max_v=20)
    if "renewalDays" in data:
        out["renewalDays"] = _num(data, "renewalDays", errors, integer=True, min_v=1, max_v=365)
    if "reminderChannel" in data:
        out["reminderChannel"] = _enum(data, "reminderChannel", REMINDER_CHANNELS, errors)
    if "dueSoonLeadDays" in data:
        out["dueSoonLeadDays"] = _num(data, "dueSoonLeadDays", errors, integer=True, min_v=0, max_v=30)
    if "overdueReminderIntervalDays" in data:
        out["overdueReminderIntervalDays"] = _num(
            data, "overdueReminderIntervalDays", errors, integer=True, min_v=1, max_v=60
        )
    if "maxOverdueReminders" in data:
        out["maxOverdueReminders"] = _num(data, "maxOverdueReminders", errors, integer=True, min_v=0, max_v=20)
    if "contactPhone" in data:
        out["contactPhone"] = _opt_str(data, "contactPhone", errors, max_len=24)
    _raise(errors)
    return {k: v for k, v in out.items() if v is not None}


def login(data: dict) -> dict:
    errors = []
    pin = _str(data, "pin", errors, required=True, min_len=4, max_len=32)
    if pin is not None and (len(pin) < 4 or len(pin) > 32):
        errors.append(_issue("pin", "PIN must be 4–32 characters"))
    _raise(errors)
    return {"pin": pin}
