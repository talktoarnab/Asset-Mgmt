import os

from lib.auth import hash_pin, issue_session, pin_matches, pin_matches_org, verify_pin, verify_session
from lib.errors import HttpError
import pytest


def test_pin_accepts_configured_value():
    os.environ["AUTH_MODE"] = "pin"
    os.environ["DESK_PIN"] = "246810"
    assert pin_matches("246810") is True
    assert pin_matches("000000") is False


def test_session_round_trips():
    os.environ["SESSION_SECRET"] = "test-secret-for-hmac"
    token = issue_session(
        {"orgId": "main", "userId": "desk", "email": "", "name": "Desk", "roles": ["admin", "staff"]}
    )
    auth = verify_session(token)
    assert auth["orgId"] == "main"
    assert "admin" in auth["roles"]


def test_rejects_tampered_token():
    os.environ["SESSION_SECRET"] = "test-secret-for-hmac"
    token = issue_session({"orgId": "main", "userId": "desk", "email": "", "name": "Desk", "roles": ["staff"]})
    with pytest.raises(HttpError):
        verify_session(f"{token}x")


def test_hashed_pin_round_trip():
    os.environ["AUTH_MODE"] = "pin"
    hashed = hash_pin("246810")
    assert verify_pin("246810", hashed) is True
    assert verify_pin("000000", hashed) is False
    org = {"orgId": "kanchan", "pinHash": hashed}
    assert pin_matches_org(org, "246810") is True
    assert pin_matches_org(org, "000000") is False


def test_bootstrap_pin_only_for_default_org():
    os.environ["AUTH_MODE"] = "pin"
    os.environ["ORG_ID"] = "main"
    os.environ["DESK_PIN"] = "246810"
    assert pin_matches_org({"orgId": "main"}, "246810") is True
    assert pin_matches_org({"orgId": "other"}, "246810") is False
