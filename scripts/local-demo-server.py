from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1] / "artifacts" / "pv-sizing" / "dist" / "public"
SESSION_COOKIE = "sd.demo=1; Path=/; SameSite=Lax"


class LocalDemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/login":
            self._discard_body()
            self._json(
                {
                    "user": {
                        "id": 1,
                        "email": "geralmarciof@gmail.com",
                        "nome": "Demo Local",
                        "role": "admin",
                        "companyId": 1,
                    },
                    "company": self._company(),
                },
                cookies=[SESSION_COOKIE],
            )
            return

        if parsed.path == "/api/auth/logout":
            self._discard_body()
            self._json({"ok": True}, cookies=["sd.demo=; Path=/; Max-Age=0; SameSite=Lax"])
            return

        if parsed.path.startswith("/api/"):
            self._discard_body()
            self._json({"id": 1, "ok": True})
            return

        super().do_POST()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/me":
            self._json(
                {
                    "user": {
                        "id": 1,
                        "email": "geralmarciof@gmail.com",
                        "nome": "Demo Local",
                        "role": "admin",
                        "companyId": 1,
                    },
                    "company": self._company(),
                }
            )
            return

        if parsed.path.startswith("/api/"):
            self._json(self._empty_api_response(parsed.path))
            return

        requested = ROOT / parsed.path.lstrip("/")
        if parsed.path != "/" and not requested.exists():
            self.path = "/index.html"
        super().do_GET()

    def do_PUT(self):
        self._discard_body()
        self._json({"id": 1, "ok": True})

    def do_PATCH(self):
        self._discard_body()
        self._json({"id": 1, "ok": True})

    def do_DELETE(self):
        self._discard_body()
        self._json({"ok": True})

    def _discard_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length:
            self.rfile.read(length)

    def _json(self, payload, status=HTTPStatus.OK, cookies=None):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _company(self):
        return {
            "id": 1,
            "nome": "SolarDim Demo",
            "nif": "",
            "telefone": "",
            "morada": "",
            "email": "",
            "website": "",
            "corPrimaria": "#0D2B45",
            "corSecundaria": "#F5A623",
            "logotipoUrl": None,
        }

    def _empty_api_response(self, path):
        if path.endswith("/dashboard") or path.endswith("/dashboard/summary"):
            return {
                "totalClientes": 0,
                "totalSistemas": 0,
                "totalPaineis": 0,
                "totalInversores": 0,
                "totalBaterias": 0,
                "clientesPorTipo": [],
            }
        if any(part in path for part in ["/customers", "/systems", "/panels", "/inverters", "/batteries", "/projects", "/proposals"]):
            return []
        return {}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5173"))
    server = ThreadingHTTPServer(("127.0.0.1", port), LocalDemoHandler)
    print(f"SolarDim local demo on http://127.0.0.1:{port}")
    server.serve_forever()
