#!/usr/bin/env python3
"""
CORS proxy server for the Anypoint API Portal "Try It Out" feature.

Forwards API requests from the browser to Anypoint Platform APIs,
adding CORS headers so the static portal can make cross-origin calls.

Usage:
    python3 scripts/proxy_server.py [--host 127.0.0.1] [--port 8083]
"""

import argparse
import json
import ssl
import sys
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


# Only allow requests to known Anypoint domains
ALLOWED_HOSTS = {
    'anypoint.mulesoft.com',
    'omni.mulesoft.com',
}

# Any subdomain of these domains is also allowed (regional endpoints)
ALLOWED_HOST_SUFFIXES = ['.anypoint.mulesoft.com', '.platform.mulesoft.com', '.mulesoft.com']

REQUEST_TIMEOUT = 30  # seconds
VERBOSE = False  # Set via --verbose flag; shows full untruncated bodies


def _fmt_json(raw: str) -> str:
    """Pretty-print a JSON string."""
    try:
        return json.dumps(json.loads(raw), indent=2)
    except (json.JSONDecodeError, TypeError):
        return raw


def _fmt_sse(raw: str) -> str:
    """Format an SSE event stream for readable debug output."""
    lines = []
    for block in raw.split('\n'):
        stripped = block.strip()
        if not stripped:
            continue
        if stripped.startswith('data:'):
            payload = stripped[5:].strip()
            lines.append('data:')
            for jline in _fmt_json(payload).splitlines():
                lines.append(f'  {jline}')
        else:
            lines.append(stripped)
    return '\n'.join(lines)


def _fmt_body(raw: str, max_len: int = 500) -> str:
    """Pretty-print response bodies for readability; truncate unless VERBOSE."""
    # Detect SSE event streams
    if 'event:' in raw[:200] or raw.lstrip().startswith('data:'):
        pretty = _fmt_sse(raw)
    else:
        pretty = _fmt_json(raw)
    if VERBOSE or len(pretty) <= max_len:
        return pretty
    return pretty[:max_len] + f'\n       ... ({len(pretty)} bytes total, use --verbose to see full)'


class ProxyHandler(BaseHTTPRequestHandler):
    """HTTP request handler that proxies requests to Anypoint APIs."""

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        """Health check endpoint."""
        if self.path == '/health':
            self.send_response(200)
            self._send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok'}).encode())
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()

    def do_POST(self):
        """Proxy a request to the target API."""
        if self.path not in ('/', '/proxy'):
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()
            return

        try:
            # Read and parse the request body
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body)

            method = payload.get('method', 'GET').upper()
            url = payload.get('url', '')
            headers = payload.get('headers', {})
            body = payload.get('body')

            # Log request
            t0 = time.time()
            sys.stderr.write(f"\n[proxy] ─── REQUEST ───────────────────────────\n")
            sys.stderr.write(f"[proxy] {method} {url}\n")
            for k, v in headers.items():
                sys.stderr.write(f"[proxy]   {k}: {v}\n")
            if body:
                sys.stderr.write(f"[proxy]   Body:\n")
                for line in _fmt_body(body).splitlines():
                    sys.stderr.write(f"[proxy]     {line}\n")

            # Validate the target URL
            if not self._is_allowed_url(url):
                self._send_error(403, f'Target host not allowed. Allowed: {", ".join(sorted(ALLOWED_HOSTS))}')
                return

            # Build and send the upstream request
            req_data = body.encode('utf-8') if body else None
            req = Request(url, data=req_data, method=method)
            for key, value in headers.items():
                req.add_header(key, value)

            # Create SSL context - try certifi first, fallback to unverified for development
            try:
                import certifi
                ctx = ssl.create_default_context(cafile=certifi.where())
            except ImportError:
                # Development fallback: disable SSL verification
                ctx = ssl._create_unverified_context()
                sys.stderr.write("[proxy] Warning: SSL verification disabled (certifi not found)\n")

            try:
                with urlopen(req, timeout=REQUEST_TIMEOUT, context=ctx) as resp:
                    resp_body = resp.read().decode('utf-8', errors='replace')
                    resp_headers = {k: v for k, v in resp.getheaders()}
                    elapsed = (time.time() - t0) * 1000
                    sys.stderr.write(f"[proxy] ─── RESPONSE ({elapsed:.0f}ms) ─────────────────────\n")
                    sys.stderr.write(f"[proxy] Status: {resp.status}\n")
                    for k, v in resp_headers.items():
                        sys.stderr.write(f"[proxy]   {k}: {v}\n")
                    sys.stderr.write(f"[proxy]   Body:\n")
                    for line in _fmt_body(resp_body).splitlines():
                        sys.stderr.write(f"[proxy]     {line}\n")
                    self._send_json(200, {
                        'status': resp.status,
                        'headers': resp_headers,
                        'body': resp_body,
                    })
            except HTTPError as e:
                resp_body = e.read().decode('utf-8', errors='replace')
                resp_headers = {k: v for k, v in e.headers.items()}
                elapsed = (time.time() - t0) * 1000
                sys.stderr.write(f"[proxy] ─── RESPONSE ERROR ({elapsed:.0f}ms) ────────────────\n")
                sys.stderr.write(f"[proxy] Status: {e.code}\n")
                for k, v in resp_headers.items():
                    sys.stderr.write(f"[proxy]   {k}: {v}\n")
                sys.stderr.write(f"[proxy]   Body:\n")
                for line in _fmt_body(resp_body).splitlines():
                    sys.stderr.write(f"[proxy]     {line}\n")
                self._send_json(200, {
                    'status': e.code,
                    'headers': resp_headers,
                    'body': resp_body,
                })

        except URLError as e:
            self._send_error(502, f'Connection failed: {e.reason}')
        except json.JSONDecodeError:
            self._send_error(400, 'Invalid JSON in request body')
        except Exception as e:
            self._send_error(500, f'Proxy error: {str(e)}')

    def _is_allowed_url(self, url: str) -> bool:
        """Check if the target URL is in the allowed hosts list."""
        from urllib.parse import urlparse
        try:
            parsed = urlparse(url)
            host = parsed.hostname
            if parsed.scheme != 'https' or not host:
                return False
            if host in ALLOWED_HOSTS:
                return True
            return any(host.endswith(suffix) for suffix in ALLOWED_HOST_SUFFIXES)
        except Exception:
            return False

    def _send_json(self, status: int, data: dict):
        """Send a JSON response with CORS headers."""
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self._send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, message: str):
        """Send an error JSON response."""
        self._send_json(status, {'error': message})

    def log_message(self, format, *args):
        """Override to use a cleaner log format."""
        method_url = args[0] if args else ''
        status = args[1] if len(args) > 1 else ''
        sys.stderr.write(f"[proxy] {method_url} → {status}\n")


def main():
    global VERBOSE
    parser = argparse.ArgumentParser(description='CORS proxy for Anypoint API Portal')
    parser.add_argument('--host', type=str, default='127.0.0.1', help='Host to bind to (default: 127.0.0.1)')
    parser.add_argument('--port', type=int, default=8080, help='Port to listen on (default: 8080)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Show full untruncated request/response bodies')
    args = parser.parse_args()
    VERBOSE = args.verbose

    server = HTTPServer((args.host, args.port), ProxyHandler)
    print(f"🔀 Anypoint API Proxy running on http://{args.host}:{args.port}")
    print(f"   POST /proxy  — Forward API requests")
    print(f"   GET  /health — Health check")
    print(f"   Allowed hosts: {', '.join(sorted(ALLOWED_HOSTS))}")
    print(f"\n   Press Ctrl+C to stop\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Proxy server stopped.")
        server.server_close()


if __name__ == '__main__':
    main()
