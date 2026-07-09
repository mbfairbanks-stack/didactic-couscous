#!/usr/bin/env python3
"""Tiny single-user backup API for the gym tracker.

Stores one JSON blob (your whole export) and hands it back. Auth is a single
shared secret token via the Authorization header. Stdlib only -- no pip.

Env vars:
  GYM_BACKUP_TOKEN  required, the shared secret
  GYM_BACKUP_FILE   where to store the blob (default /var/lib/gym-tracker/backup.json)
  GYM_BACKUP_HOST   bind host (default 127.0.0.1 -- sits behind Caddy)
  GYM_BACKUP_PORT   bind port (default 8787)

Routes (also work under an /api prefix if not stripped by the proxy):
  GET  /backup  -> 200 with the stored JSON, or 404 if none
  PUT  /backup  -> stores the request body (validated as JSON)
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ.get("GYM_BACKUP_TOKEN", "")
DATA_FILE = os.environ.get("GYM_BACKUP_FILE", "/var/lib/gym-tracker/backup.json")
HOST = os.environ.get("GYM_BACKUP_HOST", "127.0.0.1")
PORT = int(os.environ.get("GYM_BACKUP_PORT", "8787"))
MAX_BODY = 8 * 1024 * 1024  # 8 MB is plenty for a lifetime of workouts


def authorized(handler):
    return bool(TOKEN) and handler.headers.get("Authorization", "") == f"Bearer {TOKEN}"


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")

    def _send(self, code, body=b""):
        self.send_response(code)
        self._cors()
        if body:
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _is_backup_path(self):
        return self.path.split("?")[0].rstrip("/") in ("/backup", "/api/backup")

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        if not self._is_backup_path():
            return self._send(404, b'{"error":"not found"}')
        if not authorized(self):
            return self._send(401, b'{"error":"unauthorized"}')
        if not os.path.exists(DATA_FILE):
            return self._send(404, b'{"error":"no backup yet"}')
        with open(DATA_FILE, "rb") as f:
            self._send(200, f.read())

    def do_PUT(self):
        if not self._is_backup_path():
            return self._send(404, b'{"error":"not found"}')
        if not authorized(self):
            return self._send(401, b'{"error":"unauthorized"}')
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            return self._send(400, b'{"error":"bad content-length"}')
        body = self.rfile.read(length)
        try:
            json.loads(body)
        except ValueError:
            return self._send(400, b'{"error":"invalid json"}')
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "wb") as f:
            f.write(body)
        os.replace(tmp, DATA_FILE)  # atomic swap so a crash never truncates the backup
        self._send(200, b'{"ok":true}')

    def log_message(self, *args):
        pass  # stay quiet in the journal


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Refusing to start: set GYM_BACKUP_TOKEN")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
