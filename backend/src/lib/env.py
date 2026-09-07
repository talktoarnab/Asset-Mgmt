import os


def required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def table_name() -> str:
    return required("TABLE_NAME")


def region() -> str:
    return os.environ.get("AWS_REGION", "eu-north-1")


def stage() -> str:
    return os.environ.get("STAGE", "dev")


def org_id() -> str:
    return os.environ.get("ORG_ID", "main")


def org_name() -> str:
    return os.environ.get("ORG_NAME", "My Library")


def desk_pin() -> str:
    return os.environ.get("DESK_PIN", "123456")


def session_secret() -> str:
    return os.environ.get("SESSION_SECRET", "dev-session-secret-change-me")


def auth_mode() -> str:
    return "dev" if os.environ.get("AUTH_MODE") == "dev" else "pin"


def dynamo_endpoint() -> str | None:
    return os.environ.get("DYNAMO_ENDPOINT") or None
