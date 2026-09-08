from domain.orgs import public_org
from domain.schemas import login, org_create
from lib.errors import ValidationError
import pytest


def test_public_org_hides_pin_hash():
    shown = public_org(
        {"orgId": "kanchan", "name": "Kanchan Community Library", "pinHash": "pbkdf2$secret", "timezone": "Asia/Kolkata"}
    )
    assert "pinHash" not in shown
    assert shown["slug"] == "kanchan"
    assert shown["name"] == "Kanchan Community Library"


def test_login_requires_branch_id():
    with pytest.raises(ValidationError):
        login({"pin": "123456"})


def test_login_normalises_branch_id():
    parsed = login({"org": "Kanchan", "pin": "123456"})
    assert parsed["org"] == "kanchan"


def test_org_create_validates_slug():
    with pytest.raises(ValidationError):
        org_create({"name": "A library", "pin": "123456", "slug": "Nope Space"})
    parsed = org_create({"name": " Workshop ", "pin": "123456", "slug": "Tool-Room"})
    assert parsed["slug"] == "tool-room"
    assert parsed["name"] == "Workshop"
