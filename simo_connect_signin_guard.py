"""Simo Connect R10.71: server-side account gate for all calling and messaging APIs.

Only registered, authenticated Simo accounts can use Connect. This feature gate
intentionally does not change the rest of Simo, its auth implementation, or AI.
"""
from collections import defaultdict, deque
from hmac import compare_digest, digest
import os
import re
from threading import Lock
from time import monotonic
from urllib.parse import urlsplit
from flask import abort, jsonify, make_response, render_template, request, url_for
from simo_connect_identity import resolve_contact_id

CONNECT_PREFIXES = ('/api/simo-calling/', '/api/simo-connect/')
_EXTENSION_HOST = '127.0.0.1:5000'
_LIVE_HOST = 'simonchat.ai'
_VIEW_HEADER = 'X-Simo-Connect-View'
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



def register_simo_connect_signin_guard(app, current_user_email, get_user_by_email, get_db):
    extension_id = os.getenv('SIMO_CONNECT_EXTENSION_ID', '').strip()

    def extension_enabled():
        if re.fullmatch(r'[a-p]{32}', extension_id) is None:
            return False
        local = request.host == _EXTENSION_HOST and request.remote_addr == '127.0.0.1'
        live = request.host == _LIVE_HOST and request.is_secure
        return local or live

    def view_token(email):
        key = app.secret_key
        if isinstance(key, str):
            key = key.encode('utf-8')
        return digest(key, ('simo-connect-extension:' + email).encode('utf-8'), 'sha256').hex()

    @app.get('/chrome')
    def simo_chrome_info():
        store_url = os.getenv('SIMO_CHROME_STORE_URL', '').strip()
        if not re.fullmatch(r'https://chromewebstore\.google\.com/detail/(?:[a-z0-9-]+/)?[a-p]{32}', store_url):
            store_url = ''
        return render_template('simo_connect_landing.html', store_url=store_url)

    @app.get('/invite/<contact_id>')
    def simo_connect_invitation(contact_id):
        if not re.fullmatch(r'[a-f0-9]{32}', contact_id):
            abort(404)
        conn = get_db()
        try:
            card = resolve_contact_id(conn, contact_id)
        finally:
            conn.close()
        inviter = get_user_by_email(card['email']) if card else None
        if inviter is None:
            abort(404)
        email = str(current_user_email() or '').strip().lower()
        signed_in = bool(email and get_user_by_email(email))
        response = make_response(render_template(
            'simo_connect_landing.html', invite_id=contact_id, handle=card['handle'],
            inviter_name=inviter['name'] or '@' + card['handle'], signed_in=signed_in,
            home=url_for('home'),
        ))
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Robots-Tag'] = 'noindex, nofollow'
        return response

    @app.get('/connect/extension')
    def simo_connect_extension():
        if not extension_enabled() or not app.secret_key:
            abort(404)
        email = str(current_user_email() or '').strip().lower()
        signed_in = bool(email and get_user_by_email(email))
        response = make_response(render_template(
            'simo_connect_extension.html', view_token=view_token(email) if signed_in else '',
            extension_origin='chrome-extension://' + extension_id,
        ), 200 if signed_in else 401)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' blob: data:; media-src 'self' blob:; object-src 'none'; "
            "base-uri 'none'; form-action 'self'; frame-src 'none'; "
            f'frame-ancestors chrome-extension://{extension_id}'
        )
        return response

    @app.before_request
    def simo_connect_require_registered_account():
        path = request.path or ''
        if not path.startswith(CONNECT_PREFIXES):
            return None

        email = str(current_user_email() or '').strip().lower()
        embedded_view = request.headers.get(_VIEW_HEADER)
        if embedded_view is not None and (
            not extension_enabled() or not app.secret_key or not email
            or re.fullmatch(r'[0-9a-f]{64}', embedded_view) is None
            or not compare_digest(embedded_view, view_token(email))
        ):
            response = jsonify(ok=False, error='Simo account changed. Reopen Connect.')
            response.headers[_VIEW_HEADER] = 'stale'
            return response, 401
        if not email:
            return jsonify(ok=False, error='Sign in or create a Simo account to use Simo Connect.', code='SIGN_IN_REQUIRED'), 401

        # A signed session must still reference a current registered account.
        # This also rejects stale sessions after account removal.
        account = get_user_by_email(email)
        if not account:
            response = jsonify(ok=False, error='This Simo account is unavailable. Please sign in again.', code='ACCOUNT_NOT_FOUND')
            if embedded_view is not None:
                response.headers[_VIEW_HEADER] = 'stale'
            return response, 401

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
