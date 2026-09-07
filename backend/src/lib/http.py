import json

from lib.errors import HttpError, ValidationError, bad_request

BASE_HEADERS = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
}


def json_response(status_code, body, headers=None):
    return {
        "statusCode": status_code,
        "headers": {**BASE_HEADERS, **(headers or {})},
        "body": json.dumps(body, default=str),
    }


def ok(body):
    return json_response(200, body)


def created(body):
    return json_response(201, body)


def no_content():
    return {"statusCode": 204, "headers": BASE_HEADERS, "body": ""}


def error_response(error):
    if isinstance(error, HttpError):
        return json_response(
            error.status,
            {"error": {"code": error.code, "message": str(error), "details": error.details}},
        )
    if isinstance(error, ValidationError):
        return json_response(
            400,
            {
                "error": {
                    "code": "VALIDATION_FAILED",
                    "message": "Some fields need attention.",
                    "details": error.issues,
                }
            },
        )
    print("unhandled_error", error)
    return json_response(500, {"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong on our side."}})


def parse_json_body(raw, is_base64=False):
    if not raw:
        raise bad_request("A request body is required")
    text = raw
    if is_base64:
        import base64

        text = base64.b64decode(raw).decode("utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise bad_request("Request body must be valid JSON") from None


def parse_body(schema_fn, raw, is_base64=False):
    return schema_fn(parse_json_body(raw, is_base64))
