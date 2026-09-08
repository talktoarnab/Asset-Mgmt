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


def stock_levels(asset: dict) -> tuple[int, int]:
    """Return (owned units, units on the shelf). Legacy unique copies count as 1."""
    stock = int(asset["stock"]) if asset.get("stock") is not None else 1
    if asset.get("available") is not None:
        available = int(asset["available"])
    elif asset.get("status") == "checked_out":
        available = 0
    elif asset.get("status") in ("lost", "retired"):
        available = 0
    else:
        available = stock
    return stock, max(0, available)


def with_stock(asset: dict) -> dict:
    stock, available = stock_levels(asset)
    return {
        **asset,
        "sku": asset.get("sku") or asset.get("code"),
        "stock": stock,
        "available": available,
        "unitsOnLoan": max(0, stock - available),
    }
