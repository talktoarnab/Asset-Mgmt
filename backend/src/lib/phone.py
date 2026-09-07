from lib.errors import bad_request


def normalize_phone(input_value: str, default_country_code: str = "+91") -> str:
    trimmed = (input_value or "").strip()
    if not trimmed:
        raise bad_request("Phone number is required")

    has_plus = trimmed.startswith("+")
    digits = "".join(ch for ch in trimmed if ch.isdigit())
    if len(digits) < 6:
        raise bad_request(f'"{input_value}" is not a valid phone number')

    if has_plus:
        return f"+{digits}"

    cc = "".join(ch for ch in default_country_code if ch.isdigit())
    if digits.startswith(cc) and len(digits) > len(cc) + 5:
        return f"+{digits}"
    local = digits.lstrip("0")
    return f"+{cc}{local}"


def format_phone(e164: str) -> str:
    digits = "".join(ch for ch in e164 if ch.isdigit())
    if len(digits) <= 10:
        return f"+{digits}"
    cc = digits[: len(digits) - 10]
    rest = digits[-10:]
    return f"+{cc} {rest[:5]} {rest[5:]}"
