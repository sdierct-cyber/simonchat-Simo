"""Simo Connect R10.71: server-side account gate for all calling and messaging APIs.

Only registered, authenticated Simo accounts can use Connect. This feature gate
intentionally does not change the rest of Simo, its auth implementation, or AI.
"""
from urllib.parse import urlsplit
from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from flask import jsonify, request

CONNECT_PREFIXES = ('/api/simo-calling/', '/api/simo-connect/')
# Local single-process abuse throttle. Must be replaced with a shared Redis/DB
# limiter before multi-worker production use. Never rate-limit incoming polling.
_ACTIVITY = defaultdict(deque)
_ACTIVITY_LOCK = Lock()
_LIMITS = {
    '/api/simo-calling/start': (5, 60),
    '/api/simo-calling/profile': (12, 60),
    '/api/simo-calling/signal': (180, 60),
}

def _limited(account, path):
    limit, window = _LIMITS.get(path, (30, 60))
    now = monotonic()
    key = (account, path)
    with _ACTIVITY_LOCK:
        times = _ACTIVITY[key]
        while times and times[0] <= now - window:
            times.popleft()
        if len(times) >= limit:
            return True
        times.append(now)
        return False



def register_simo_connect_signin_guard(app, current_user_email, get_user_by_email):
    @app.before_request
    def simo_connect_require_registered_account():
        path = request.path or ''
        if not path.startswith(CONNECT_PREFIXES):
            return None

        email = str(current_user_email() or '').strip().lower()
        if not email:
            return jsonify(ok=False, error='Sign in or create a Simo account to use Simo Connect.', code='SIGN_IN_REQUIRED'), 401

        # A signed session must still reference a current registered account.
        # This also rejects stale sessions after account removal.
        account = get_user_by_email(email)
        if not account:
            return jsonify(ok=False, error='This Simo account is unavailable. Please sign in again.', code='ACCOUNT_NOT_FOUND'), 401

        # No cross-site POSTs; even simple form-based CSRF must not reach signaling.
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('Origin', '').strip()
            if origin:
                try:
                    parts = urlsplit(origin)
                    if parts.scheme not in ('http', 'https') or parts.netloc.lower() != request.host.lower():
                        return jsonify(ok=False, error='Cross-site request blocked.', code='INVALID_ORIGIN'), 403
                except ValueError:
                    return jsonify(ok=False, error='Cross-site request blocked.', code='INVALID_ORIGIN'), 403
            fetch_site = request.headers.get('Sec-Fetch-Site', '').lower()
            if fetch_site == 'cross-site':
                return jsonify(ok=False, error='Cross-site request blocked.', code='INVALID_ORIGIN'), 403
            # All Connect mutations use JSON, except the dedicated multipart file-upload route.
            if path == '/api/simo-connect/files':
                if request.mimetype != 'multipart/form-data':
                    return jsonify(ok=False, error='File upload form required.'), 415
            elif not request.is_json:
                return jsonify(ok=False, error='JSON request required.'), 415
        if request.method not in ('GET', 'HEAD', 'OPTIONS') and _limited(email, path):
            response = jsonify(ok=False, error='Too many requests. Please try again later.', code='RATE_LIMITED')
            response.headers['Retry-After'] = '60'
            return response, 429
        return None
