import os
import time
import uuid as uuid_lib

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def new_id(prefix: str | None = None) -> str:
    time_part = ""
    time_ms = int(time.time() * 1000)
    for _ in range(10):
        time_part = ALPHABET[time_ms % 32] + time_part
        time_ms //= 32
    random_part = "".join(ALPHABET[b % 32] for b in os.urandom(12))
    ident = time_part + random_part
    return f"{prefix}_{ident}" if prefix else ident


def uuid() -> str:
    return str(uuid_lib.uuid4())


def new_asset_code(prefix: str) -> str:
    suffix = "".join(ALPHABET[b % 32] for b in os.urandom(6))
    return f"{prefix.upper()}-{suffix}"
