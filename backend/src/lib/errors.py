class HttpError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details


class ValidationError(Exception):
    def __init__(self, issues: list[dict]):
        super().__init__("Some fields need attention.")
        self.issues = issues


def bad_request(message: str, details=None) -> HttpError:
    return HttpError(400, "BAD_REQUEST", message, details)


def unauthorized(message: str = "Authentication required") -> HttpError:
    return HttpError(401, "UNAUTHORIZED", message)


def forbidden(message: str = "You do not have access to this action") -> HttpError:
    return HttpError(403, "FORBIDDEN", message)


def not_found(message: str = "Resource not found") -> HttpError:
    return HttpError(404, "NOT_FOUND", message)


def conflict(code: str, message: str, details=None) -> HttpError:
    return HttpError(409, code, message, details)


def unprocessable(code: str, message: str, details=None) -> HttpError:
    return HttpError(422, code, message, details)
