from urllib.parse import unquote

from lib.errors import not_found


class Router:
    def __init__(self):
        self._routes = []

    def add(self, method, pattern, handler):
        self._routes.append(
            {
                "method": method.upper(),
                "segments": [s for s in pattern.split("/") if s],
                "handler": handler,
            }
        )
        return self

    def get(self, pattern, handler):
        return self.add("GET", pattern, handler)

    def post(self, pattern, handler):
        return self.add("POST", pattern, handler)

    def patch(self, pattern, handler):
        return self.add("PATCH", pattern, handler)

    def put(self, pattern, handler):
        return self.add("PUT", pattern, handler)

    def delete(self, pattern, handler):
        return self.add("DELETE", pattern, handler)

    def match(self, method, path):
        parts = [p for p in path.split("/") if p]
        for route in self._routes:
            if route["method"] != method.upper():
                continue
            if len(route["segments"]) != len(parts):
                continue
            params = {}
            matched = True
            for segment, value in zip(route["segments"], parts):
                if segment.startswith("{") and segment.endswith("}"):
                    params[segment[1:-1]] = unquote(value)
                elif segment != value:
                    matched = False
                    break
            if matched:
                return {"handler": route["handler"], "params": params}
        return None

    def handle(self, ctx):
        found = self.match(ctx["method"], ctx["path"])
        if not found:
            raise not_found(f"No route for {ctx['method']} {ctx['path']}")
        return found["handler"]({**ctx, "params": found["params"]})
