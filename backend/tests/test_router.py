import json

from domain.schemas import member_create
from lib.errors import HttpError
from lib.http import error_response, parse_body
from lib.router import Router
import pytest


def noop(_ctx):
    return {"statusCode": 200, "body": ""}


def make_router():
    router = Router()
    router.get("/v1/assets", noop)
    router.get("/v1/assets/{assetId}", noop)
    router.get("/v1/members/{memberId}/history", noop)
    router.post("/v1/assets", noop)
    return router


def test_static_route():
    assert make_router().match("GET", "/v1/assets")["params"] == {}


def test_path_params():
    router = make_router()
    assert router.match("GET", "/v1/assets/ast-123")["params"] == {"assetId": "ast-123"}
    assert router.match("GET", "/v1/members/mem-9/history")["params"] == {"memberId": "mem-9"}


def test_method_distinction():
    router = make_router()
    assert router.match("POST", "/v1/assets") is not None
    assert router.match("DELETE", "/v1/assets") is None


def test_no_extra_segments():
    assert make_router().match("GET", "/v1/assets/ast-123/extra") is None


def test_percent_encoded():
    assert make_router().match("GET", "/v1/assets/BK%2F12")["params"] == {"assetId": "BK/12"}


def test_unknown_path_404():
    with pytest.raises(HttpError):
        make_router().handle(
            {
                "method": "GET",
                "path": "/v1/nope",
                "query": {},
                "body": None,
                "isBase64Encoded": False,
                "auth": None,
            }
        )


def test_parse_valid():
    parsed = parse_body(member_create, json.dumps({"name": " Ananya ", "phone": "9876543210"}))
    assert parsed["name"] == "Ananya"


def test_parse_base64():
    import base64

    raw = base64.b64encode(json.dumps({"name": "Rohit", "phone": "9812345678"}).encode()).decode()
    assert parse_body(member_create, raw, True)["name"] == "Rohit"


def test_malformed_json():
    with pytest.raises(Exception, match="valid JSON"):
        parse_body(member_create, "{oops")


def test_requires_body():
    with pytest.raises(Exception, match="body is required"):
        parse_body(member_create, None)


def test_error_response_domain():
    response = error_response(HttpError(409, "ASSET_UNAVAILABLE", "Already out"))
    assert response["statusCode"] == 409
    assert json.loads(response["body"])["error"]["code"] == "ASSET_UNAVAILABLE"


def test_schema_field_errors():
    thrown = None
    try:
        parse_body(member_create, json.dumps({"name": "", "phone": "9876543210"}))
    except Exception as error:
        thrown = error
    response = error_response(thrown)
    assert response["statusCode"] == 400
    assert json.loads(response["body"])["error"]["details"][0]["field"] == "name"


def test_unexpected_error_does_not_leak():
    response = error_response(Exception("connection string: postgres://secret"))
    assert response["statusCode"] == 500
    assert "secret" not in response["body"]
