import os

from lib.auth import issue_session, pin_matches, verify_session
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
