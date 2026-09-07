import base64
import hashlib
import hmac
import json
import time

from lib import env
from lib.errors import forbidden, unauthorized

SESSION_TTL_SECONDS = 12 * 60 * 60


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def pin_matches(presented: str) -> bool:
    if env.auth_mode() == "dev":
        return len(presented) > 0
    expected = env.desk_pin()
    a = presented.encode("utf-8")
    b = expected.encode("utf-8")
    if len(a) != len(b):
        return False
    return hmac.compare_digest(a, b)


def issue_session(auth: dict) -> str:
    payload = {
        "orgId": auth["orgId"],
        "userId": auth["userId"],
        "name": auth["name"],
        "roles": auth["roles"],
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
    }
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _b64url(hmac.new(env.session_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_session(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 2:
        raise unauthorized()
    body, sig = parts
    expected = _b64url(hmac.new(env.session_secret().encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    presented = sig.encode("ascii")
    wanted = expected.encode("ascii")
    if len(presented) != len(wanted) or not hmac.compare_digest(presented, wanted):
        raise unauthorized()
    try:
        payload = json.loads(_b64url_decode(body))
    except Exception:
        raise unauthorized() from None
    if payload.get("exp", 0) < int(time.time()):
        raise unauthorized("Your session expired. Sign in again.")
    return {
        "orgId": payload["orgId"],
        "userId": payload["userId"],
        "name": payload["name"],
        "email": "",
        "roles": payload["roles"],
    }


def bearer_token(event: dict) -> str | None:
    headers = event.get("headers") or {}
    raw = None
    for key, value in headers.items():
        if key.lower() == "authorization":
            raw = value
            break
    if not raw:
        return None
    prefix = "bearer "
    if raw.lower().startswith(prefix):
        return raw[len(prefix) :].strip()
    return None


def desk_staff() -> dict:
    return {
        "orgId": env.org_id(),
        "userId": "desk",
        "email": "",
        "name": "Desk",
        "roles": ["admin", "staff"],
    }


def auth_context_from(event: dict) -> dict:
    if env.auth_mode() == "dev" and not bearer_token(event):
        return desk_staff()
    header = bearer_token(event)
    if not header:
        raise unauthorized()
    return verify_session(header)


def require_role(auth: dict, role: str) -> None:
    if role not in auth.get("roles", []):
        raise forbidden(f"This action requires the {role} role.")


def actor_label(auth: dict) -> str:
    return auth.get("name") or auth.get("userId") or "desk"
