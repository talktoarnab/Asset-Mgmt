def pk(org_id: str) -> str:
    return f"ORG#{org_id}"


def sk_org() -> str:
    return "ORG"


def sk_member(member_id: str) -> str:
    return f"MEMBER#{member_id}"


def sk_asset(asset_id: str) -> str:
    return f"ASSET#{asset_id}"


def sk_checkout(checkout_id: str) -> str:
    return f"CHECKOUT#{checkout_id}"


def sk_unit(asset_id: str, unit_id: str) -> str:
    return f"UNIT#{asset_id}#{unit_id}"


PREFIX_MEMBER = "MEMBER#"
PREFIX_ASSET = "ASSET#"
PREFIX_CHECKOUT = "CHECKOUT#"
PREFIX_UNIT = "UNIT#"

GSI1 = "gsi1"
GSI2 = "gsi2"
GSI3 = "gsi3"

ORG_REGISTRY_PK = "ORGS"


def open_loans_pk(org_id: str) -> str:
    return f"ORG#{org_id}#OPEN"


def open_loans_sk(due_at: str, checkout_id: str) -> str:
    return f"{due_at}#{checkout_id}"


def phone_lookup_pk(org_id: str, phone: str) -> str:
    return f"ORG#{org_id}#PHONE#{phone}"


def asset_code_lookup_pk(org_id: str, code: str) -> str:
    return f"ORG#{org_id}#CODE#{code.upper()}"


def member_history_pk(org_id: str, member_id: str) -> str:
    return f"ORG#{org_id}#MEMBER#{member_id}"


def unit_serial_lookup_pk(org_id: str, serial: str) -> str:
    return f"ORG#{org_id}#UNIT#{serial.upper()}"
