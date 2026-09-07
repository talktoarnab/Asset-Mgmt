TIER_BORROW_LIMITS = {
    "basic": 2,
    "standard": 3,
    "premium": 6,
    "staff": 10,
}


def borrow_limit_for(member: dict) -> int:
    if member.get("borrowLimit") is not None:
        return int(member["borrowLimit"])
    return TIER_BORROW_LIMITS.get(member.get("tier"), 3)
