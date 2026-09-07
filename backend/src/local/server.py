from http.server import BaseHTTPRequestHandler, HTTPServer
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("AUTH_MODE", "dev")
os.environ.setdefault("TABLE_NAME", "shelfkit-local")
os.environ.setdefault("DYNAMO_ENDPOINT", "http://localhost:8000")
os.environ.setdefault("AWS_REGION", "eu-north-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "local")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "local")
os.environ.setdefault("ORG_ID", "dev-branch")
os.environ.setdefault("DESK_PIN", "123456")
os.environ.setdefault("SESSION_SECRET", "dev-session-secret-change-me")

from handler import handler  # noqa: E402

PORT = int(os.environ.get("PORT", "4000"))

CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(format % args)

    def _cors(self):
        for k, v in CORS.items():
            self.send_header(k, v)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _handle(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else None
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        event = {
            "version": "2.0",
            "rawPath": parsed.path,
            "rawQueryString": parsed.query,
            "queryStringParameters": query,
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "body": body,
            "isBase64Encoded": False,
            "requestContext": {"http": {"method": self.command, "path": parsed.path}},
        }
        result = handler(event)
        self.send_response(result.get("statusCode") or 200)
        headers = result.get("headers") or {}
        for k, v in headers.items():
            self.send_header(k, v)
        self._cors()
        self.end_headers()
        self.wfile.write((result.get("body") or "").encode("utf-8"))

    do_GET = _handle
    do_POST = _handle
    do_PATCH = _handle
    do_PUT = _handle
    do_DELETE = _handle


if __name__ == "__main__":
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"API listening on http://localhost:{PORT} (auth: {os.environ.get('AUTH_MODE')})")
    server.serve_forever()
