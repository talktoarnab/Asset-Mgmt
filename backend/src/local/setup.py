#!/usr/bin/env python3
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("TABLE_NAME", "shelfkit-local")
os.environ.setdefault("DYNAMO_ENDPOINT", "http://localhost:8000")
os.environ.setdefault("AWS_REGION", "eu-north-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local")

import boto3
from botocore.exceptions import ClientError

from domain.assets import create_asset
from domain.checkouts import checkout_asset, get_checkout
from domain.keys import open_loans_pk, open_loans_sk, pk, sk_checkout
from domain.members import create_member, get_member
from domain.orgs import ensure_org, set_org_pin, update_org
from lib.ddb import drop_none, table

TABLE = os.environ["TABLE_NAME"]
ORG_ID = os.environ.get("DEV_ORG_ID", "dev-branch")

ddb = boto3.client(
    "dynamodb",
    region_name=os.environ["AWS_REGION"],
    endpoint_url=os.environ["DYNAMO_ENDPOINT"],
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)


def recreate_table():
    try:
        ddb.delete_table(TableName=TABLE)
        waiter = ddb.get_waiter("table_not_exists")
        waiter.wait(TableName=TABLE)
        print(f"dropped existing table {TABLE}")
    except ClientError as error:
        if error.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    ddb.create_table(
        TableName=TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": name, "AttributeType": "S"}
            for name in ("PK", "SK", "gsi1pk", "gsi1sk", "gsi2pk", "gsi2sk", "gsi3pk", "gsi3sk")
        ],
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": name,
                "KeySchema": [
                    {"AttributeName": f"{name}pk", "KeyType": "HASH"},
                    {"AttributeName": f"{name}sk", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
            for name in ("gsi1", "gsi2", "gsi3")
        ],
    )
    ddb.get_waiter("table_exists").wait(TableName=TABLE)
    print(f"created table {TABLE}")


CATALOGUE = [
    {"title": "The Argumentative Indian", "creator": "Amartya Sen", "category": "book", "location": "A1"},
    {"title": "Things Fall Apart", "creator": "Chinua Achebe", "category": "book", "location": "A2"},
    {"title": "Sapiens", "creator": "Yuval Noah Harari", "category": "book", "location": "A2"},
    {"title": "Clean Code", "creator": "Robert C. Martin", "category": "book", "location": "B1"},
    {"title": "Midnight’s Children", "creator": "Salman Rushdie", "category": "book", "location": "A1"},
    {"title": "The God of Small Things", "creator": "Arundhati Roy", "category": "book", "location": "A3"},
    {
        "title": "Bosch GSB 600 Impact Drill",
        "creator": "Bosch",
        "category": "tool",
        "location": "Tool wall",
        "replacementCost": 4200,
        "stock": 4,
    },
    {
        "title": "Makita Orbital Sander",
        "creator": "Makita",
        "category": "tool",
        "location": "Tool wall",
        "replacementCost": 6500,
        "stock": 3,
    },
    {
        "title": "Canon EOS 200D Camera Kit",
        "creator": "Canon",
        "category": "equipment",
        "location": "Locker 2",
        "replacementCost": 38000,
    },
    {
        "title": "Epson Portable Projector",
        "creator": "Epson",
        "category": "equipment",
        "location": "Locker 1",
        "replacementCost": 27000,
    },
    {
        "title": "Raspberry Pi 5 Starter Kit",
        "creator": "Raspberry Pi Foundation",
        "category": "device",
        "location": "Shelf E",
        "replacementCost": 9500,
    },
    {"title": "Planet Earth II (Blu-ray)", "creator": "BBC", "category": "media", "location": "Media rack"},
]

PEOPLE = [
    {"name": "Ananya Sharma", "phone": "9876543210", "tier": "premium"},
    {"name": "Rohit Verma", "phone": "9812345678", "tier": "standard"},
    {"name": "Meera Iyer", "phone": "9900112233", "tier": "standard"},
    {"name": "Daniel Fernandes", "phone": "9765432109", "tier": "basic"},
    {"name": "Priya Nair", "phone": "9123456780", "tier": "premium"},
    {"name": "Imran Qureshi", "phone": "9345678123", "tier": "basic"},
]


def backdate(org_id, checkout_id, days_ago, loan_days):
    checkout = get_checkout(org_id, checkout_id)
    checked_out_at = time.time() * 1000 - days_ago * 86_400_000
    from datetime import datetime, timezone

    checked = datetime.fromtimestamp(checked_out_at / 1000, tz=timezone.utc)
    due = datetime.fromtimestamp((checked_out_at + loan_days * 86_400_000) / 1000, tz=timezone.utc)
    updated = {
        **checkout,
        "checkedOutAt": checked.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "dueAt": due.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    table().put_item(
        Item=drop_none(
            {
                "PK": pk(org_id),
                "SK": sk_checkout(checkout_id),
                "entityType": "Checkout",
                "gsi1pk": open_loans_pk(org_id),
                "gsi1sk": open_loans_sk(updated["dueAt"], checkout_id),
                "gsi3pk": f"ORG#{org_id}#MEMBER#{checkout['memberId']}",
                "gsi3sk": f"CHECKOUT#{checkout_id}",
                **updated,
            }
        )
    )


WORKSHOP = [
    {
        "title": "DeWalt Circular Saw",
        "creator": "DeWalt",
        "category": "tool",
        "location": "Bay 1",
        "replacementCost": 8900,
        "stock": 2,
    },
    {
        "title": "F-clamp set (6)",
        "creator": "Irwin",
        "category": "tool",
        "location": "Bay 2",
        "replacementCost": 1800,
        "stock": 4,
    },
    {
        "title": "Soldering station",
        "creator": "Weller",
        "category": "device",
        "location": "Electronics",
        "replacementCost": 5200,
        "stock": 3,
    },
]

WORKSHOP_PEOPLE = [
    {"name": "Kavya Reddy", "phone": "9000011122", "tier": "staff"},
    {"name": "Omar Khalid", "phone": "9000033344", "tier": "standard"},
]


def seed_branch(org_id, name, catalogue, people, loans=()):
    org = ensure_org(org_id, name)
    set_org_pin(org_id, "123456")
    update_org(org_id, {"contactPhone": "+91 80 4123 9000", "defaultLoanDays": 14})
    assets = [create_asset(org_id, {**entry, "stock": entry.get("stock") or 2}) for entry in catalogue]
    members = [create_member(org_id, person, org["defaultCountryCode"]) for person in people]
    for asset_index, member_index, days_ago in loans:
        fresh = get_member(org_id, members[member_index]["memberId"])
        checkout = checkout_asset(
            {
                "org": {**org, "contactPhone": "+91 80 4123 9000"},
                "member": fresh,
                "asset": assets[asset_index],
                "actor": "seed@localhost",
            }
        )
        backdate(org_id, checkout["checkoutId"], days_ago, 14)
    print(f"seeded {org_id}: {len(assets)} items, {len(members)} members, {len(loans)} loans")
    return org


def main():
    recreate_table()
    seed_branch(
        ORG_ID,
        "Kanchan Community Library",
        CATALOGUE,
        PEOPLE,
        loans=[(0, 0, 20), (6, 1, 16), (8, 2, 13), (3, 0, 5), (10, 4, 1)],
    )
    seed_branch("makerspace", "Workshop tool room", WORKSHOP, WORKSHOP_PEOPLE, loans=[(0, 0, 3)])
    print("\nSign in with branch ID `dev-branch` or `makerspace`. PIN 123456 (any PIN in AUTH_MODE=dev).")
    print("Start the API with: make dev")


if __name__ == "__main__":
    main()
