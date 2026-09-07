import pytest
from lib.phone import format_phone, normalize_phone


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("9876543210", "+919876543210"),
        ("09876543210", "+919876543210"),
        ("98765 43210", "+919876543210"),
        ("+91 98765-43210", "+919876543210"),
        ("919876543210", "+919876543210"),
        ("(0)98765.43210", "+919876543210"),
    ],
)
def test_normalise(raw, expected):
    assert normalize_phone(raw, "+91") == expected


def test_respects_country_code():
    assert normalize_phone("07700 900123", "+44") == "+447700900123"


def test_keeps_explicit_international():
    assert normalize_phone("+1 415 555 0134", "+91") == "+14155550134"


def test_rejects_invalid():
    with pytest.raises(Exception, match="not a valid phone number"):
        normalize_phone("n/a", "+91")
    with pytest.raises(Exception, match="required"):
        normalize_phone("   ", "+91")


def test_format_groups_national():
    assert format_phone("+919876543210") == "+91 98765 43210"
