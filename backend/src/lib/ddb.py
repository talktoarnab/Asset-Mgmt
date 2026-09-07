from decimal import Decimal

import boto3

from lib import env

INTERNAL_ATTRIBUTES = {
    "PK",
    "SK",
    "entityType",
    "gsi1pk",
    "gsi1sk",
    "gsi2pk",
    "gsi2sk",
    "gsi3pk",
    "gsi3sk",
}

_resource = None
_client = None


def _boto_kwargs():
    kwargs = {"region_name": env.region()}
    endpoint = env.dynamo_endpoint()
    if endpoint:
        kwargs["endpoint_url"] = endpoint
        kwargs["aws_access_key_id"] = env_os("AWS_ACCESS_KEY_ID", "local")
        kwargs["aws_secret_access_key"] = env_os("AWS_SECRET_ACCESS_KEY", "local")
    return kwargs


def env_os(name, default):
    import os

    return os.environ.get(name, default)


def resource():
    global _resource
    if _resource is None:
        _resource = boto3.resource("dynamodb", **_boto_kwargs())
    return _resource


def client():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb", **_boto_kwargs())
    return _client


def table():
    return resource().Table(env.table_name())


def table_name():
    return env.table_name()


def from_ddb(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, dict):
        return {k: from_ddb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [from_ddb(v) for v in value]
    return value


def to_entity(item: dict) -> dict:
    entity = {}
    for key, value in (item or {}).items():
        if key not in INTERNAL_ATTRIBUTES:
            entity[key] = from_ddb(value)
    return entity


def drop_none(item: dict) -> dict:
    return {k: v for k, v in item.items() if v is not None}


def query_all(kwargs, limit=2000):
    items = []
    while True:
        result = table().query(**kwargs)
        for item in result.get("Items", []):
            items.append(to_entity(item))
            if len(items) >= limit:
                return items[:limit]
        if "LastEvaluatedKey" not in result:
            break
        kwargs = {**kwargs, "ExclusiveStartKey": result["LastEvaluatedKey"]}
    return items[:limit]


def serialize_item(item: dict) -> dict:
    from boto3.dynamodb.types import TypeSerializer

    serializer = TypeSerializer()
    return {k: serializer.serialize(v) for k, v in drop_none(item).items()}
