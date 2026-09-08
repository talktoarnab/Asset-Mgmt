from domain.units import allocate_serials, counts_from_units


def test_serials_follow_sku_and_skip_gaps():
    assert allocate_serials("BK-ABC123", [], 3) == ["BK-ABC123-001", "BK-ABC123-002", "BK-ABC123-003"]
    assert allocate_serials("EQ-9", ["EQ-9-001", "EQ-9-003"], 2) == ["EQ-9-002", "EQ-9-004"]


def test_counts_ignore_lost_and_retired():
    units = [
        {"status": "available"},
        {"status": "available"},
        {"status": "checked_out"},
        {"status": "maintenance"},
        {"status": "lost"},
        {"status": "retired"},
    ]
    assert counts_from_units(units) == {
        "stock": 4,
        "available": 2,
        "unitsOnLoan": 1,
        "lostUnits": 1,
    }
