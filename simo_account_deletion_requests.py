"""Simo account deletion *request* endpoint. NOT automated deletion.
No changes to existing auth, payments, libraries, published sites or AI.
Requests are stored through the application's existing persistent privacy storage.
"""
import secrets
import datetime as dt
from urllib.parse import urlsplit
from flask import request, jsonify, session

CONFIRM = 'DELETE MY SIMO ACCOUNT'

def register_simo_account_deletion_requests(app, current_user_email, privacy_connection):
    def fail(message, status=400):
        return jsonify({'ok': False, 'error': message}), status

    def actor():
        return str(current_user_email() or '').strip().lower()

    def valid_origin():
        origin = request.headers.get('Origin', '')
        if not origin:
            return True  # CSRF token remains mandatory
        target = urlsplit(origin)
        return target.scheme in ('http', 'https') and target.netloc.lower() == request.host.lower()

    @app.get('/api/simo-account/deletion-request')
    def simo_account_deletion_info():
        email = actor()
        if not email: return fail('Sign in to request account deletion.', 401)
        token = secrets.token_urlsafe(32)
        session['simo_delete_request_csrf'] = token
        return jsonify({'ok': True, 'email': email, 'csrf': token,
                        'state': 'request_only', 'required_phrase': CONFIRM})

    @app.post('/api/simo-account/deletion-request')
    def simo_account_deletion_submit():
        email = actor()
        if not email: return fail('Sign in to request account deletion.', 401)
        if not valid_origin() or not request.is_json: return fail('Request rejected.', 403)
        data = request.get_json(silent=True) or {}
        token = str(data.get('csrf') or '')
        expected = str(session.get('simo_delete_request_csrf') or '')
        if not expected or not token or not secrets.compare_digest(token, expected):
            return fail('Refresh the confirmation form and try again.', 403)
        if str(data.get('confirmation') or '').strip() != CONFIRM:
            return fail('Confirmation phrase does not match.', 400)
        # Consume even when storage fails, so an old token cannot be replayed.
        session.pop('simo_delete_request_csrf', None)
        connection = None
        try:
            connection = privacy_connection()
            recent = connection.execute("""SELECT id FROM simo_privacy_requests
                WHERE email=? AND category='deletion' AND status IN ('new','pending')
                ORDER BY id DESC LIMIT 1""", (email,)).fetchone()
            if recent:
                return jsonify({'ok': True, 'state': 'pending_review', 'already_requested': True})
            now = dt.datetime.now(dt.timezone.utc).isoformat()
            connection.execute("""INSERT INTO simo_privacy_requests
                (created_at,name,email,category,message,ip_hash,status)
                VALUES (?,?,?,?,?,?,?)""",
                (now,'Signed-in account holder',email,'deletion',
                'Authenticated in-app account deletion request. Verify identity, Stripe status, connected data and retention requirements before fulfillment.',
                'in_app_authenticated','new'))
            connection.commit()
            return jsonify({'ok': True, 'state':'pending_review'})
        except Exception:
            app.logger.exception('Authenticated account deletion request could not be stored')
            return fail('Could not securely save your request. Nothing was deleted. Please try again or use the Privacy Policy contact form.',503)
        finally:
            if connection is not None: connection.close()
