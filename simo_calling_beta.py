"""Simo Calling beta: opt-in, authenticated 1:1 browser audio signaling.
No PSTN, telephone numbers, SMS, voicemail, recording, or paid usage.
"""
import re
import time
import uuid
from flask import request, jsonify

HANDLE = re.compile(r'^[a-z][a-z0-9_]{2,23}$')

def register_simo_calling_beta(app, get_db, current_user_email):
    def response_error(message, status=400):
        return jsonify({'ok': False, 'error': message}), status

    def actor():
        return str(current_user_email() or '').strip().lower()

    def init(conn):
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_call_handles (
            email TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE,
            last_seen INTEGER NOT NULL DEFAULT 0)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_calls (
            id TEXT PRIMARY KEY, caller TEXT NOT NULL, recipient TEXT NOT NULL,
            state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_call_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT NOT NULL,
            recipient TEXT NOT NULL, kind TEXT NOT NULL,
            data TEXT NOT NULL, created_at INTEGER NOT NULL)''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_simo_call_event_recipient ON simo_call_events(recipient, id)')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_call_missed (
            call_id TEXT PRIMARY KEY, recipient TEXT NOT NULL, caller TEXT NOT NULL,
            created_at INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0)''')
        conn.commit()

    def open_db():
        conn = get_db()
        conn.execute('PRAGMA busy_timeout=5000')
        init(conn)
        return conn

    def protect():
        origin = request.headers.get('Origin', '')
        if origin:
            from urllib.parse import urlsplit
            # Same-origin request only (Flask ProxyFix correctly sets request.host).
            if urlsplit(origin).netloc.lower() != request.host.lower():
                return False
        return True

    def identity(conn, email):
        row = conn.execute('SELECT handle FROM simo_call_handles WHERE email=?', (email,)).fetchone()
        return str(row['handle']) if row else ''

    def push(conn, call_id, recipient, kind, payload, now):
        import json
        conn.execute('INSERT INTO simo_call_events(call_id,recipient,kind,data,created_at) VALUES (?,?,?,?,?)',
                     (call_id, recipient, kind, json.dumps(payload, separators=(',', ':')), now))

    def call_for(conn, call_id, email):
        return conn.execute('SELECT * FROM simo_calls WHERE id=? AND (caller=? OR recipient=?)',
                            (call_id, email, email)).fetchone()

    @app.route('/api/simo-calling/profile', methods=['GET', 'POST'])
    def simo_calling_profile():
        email = actor()
        if not email:
            return response_error('Sign in to use Simo Calling.', 401)
        if request.method == 'POST' and not protect():
            return response_error('Cross-site request blocked.', 403)
        conn = open_db()
        try:
            if request.method == 'POST':
                data = request.get_json(silent=True) or {}
                handle = str(data.get('handle') or '').strip().lower().lstrip('@')
                if not HANDLE.fullmatch(handle):
                    return response_error('Handle must start with a letter and contain 3–24 lowercase letters, numbers or underscores.')
                try:
                    conn.execute('INSERT INTO simo_call_handles(email, handle, last_seen) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET handle=excluded.handle',
                                 (email, handle, int(time.time())))
                    conn.commit()
                except Exception as e:
                    if 'UNIQUE constraint' in str(e):
                        return response_error('That handle is already taken.', 409)
                    raise
            return jsonify({'ok': True, 'handle': identity(conn, email), 'beta': True})
        finally:
            conn.close()

    @app.post('/api/simo-calling/start')
    def simo_calling_start():
        email = actor()
        if not email:
            return response_error('Sign in first.', 401)
        if not protect():
            return response_error('Cross-site request blocked.', 403)
        data = request.get_json(silent=True) or {}
        handle = str(data.get('handle') or '').strip().lower().lstrip('@')
        call_mode = str(data.get('mode') or 'audio').strip().lower()
        if call_mode not in ('audio', 'video'):
            return response_error('Unsupported call type.')
        if not HANDLE.fullmatch(handle):
            return response_error('Enter a valid Simo handle.')
        conn = open_db()
        try:
            own_handle = identity(conn, email)
            if not own_handle:
                return response_error('Choose your own handle first.')
            dest = conn.execute('SELECT email FROM simo_call_handles WHERE handle=?', (handle,)).fetchone()
            if not dest:
                return response_error('No Simo user has that handle.', 404)
            recipient = str(dest['email'])
            if recipient == email:
                return response_error('You cannot call yourself.')
            # Keep a single concurrent ringing/connected call per account.
            existing = conn.execute('''SELECT id FROM simo_calls WHERE state IN ('ringing','active')
                AND (caller IN (?,?) OR recipient IN (?,?)) AND updated_at > ? LIMIT 1''',
                (email,recipient,email,recipient,int(time.time())-180)).fetchone()
            if existing:
                return response_error('One of these accounts already has an active call.', 409)
            now = int(time.time())
            call_id = str(uuid.uuid4())
            conn.execute('INSERT INTO simo_calls VALUES (?,?,?,?,?,?)', (call_id,email,recipient,'ringing',now,now))
            push(conn, call_id, recipient, 'incoming', {'from': own_handle, 'mode': call_mode}, now)
            conn.commit()
            return jsonify({'ok': True, 'call_id': call_id, 'to': handle, 'mode': call_mode})
        finally:
            conn.close()

    @app.post('/api/simo-calling/signal')
    def simo_calling_signal():
        email = actor()
        if not email:
            return response_error('Sign in first.', 401)
        if not protect():
            return response_error('Cross-site request blocked.', 403)
        data = request.get_json(silent=True) or {}
        call_id = str(data.get('call_id') or '')
        kind = str(data.get('kind') or '')
        payload = data.get('data') or {}
        if kind not in ('offer','answer','ice','accept','decline','hangup') or not isinstance(payload, dict):
            return response_error('Unsupported signal.')
        import json
        if len(json.dumps(payload)) > 12000:
            return response_error('Signal is too large.', 413)
        conn = open_db()
        try:
            row = call_for(conn, call_id, email)
            if not row:
                return response_error('Call not found.', 404)
            if row['state'] == 'ended':
                return response_error('This call has ended.', 409)
            if kind in ('accept','decline','answer') and email != row['recipient']:
                return response_error('Only the recipient can answer.', 403)
            if kind == 'offer' and email != row['caller']:
                return response_error('Only the caller can offer.', 403)
            now = int(time.time())
            other = row['recipient'] if email == row['caller'] else row['caller']
            if kind == 'hangup' and row['state'] == 'ringing' and email == row['caller']:
                conn.execute('''INSERT OR IGNORE INTO simo_call_missed(call_id,recipient,caller,created_at)
                                VALUES (?,?,?,?)''',(call_id,row['recipient'],row['caller'],now))
            if kind in ('decline','hangup'):
                conn.execute('UPDATE simo_calls SET state=?,updated_at=? WHERE id=?', ('ended',now,call_id))
            elif kind in ('accept','answer'):
                conn.execute('UPDATE simo_calls SET state=?,updated_at=? WHERE id=?', ('active',now,call_id))
            else:
                conn.execute('UPDATE simo_calls SET updated_at=? WHERE id=?', (now,call_id))
            push(conn,call_id,other,kind,payload,now)
            conn.commit()
            return jsonify({'ok': True})
        finally:
            conn.close()

    @app.get('/api/simo-calling/poll')
    def simo_calling_poll():
        email = actor()
        if not email:
            return response_error('Sign in first.', 401)
        try:
            after = max(0, int(request.args.get('after', '0')))
        except (ValueError, TypeError):
            after = 0
        import json
        conn = open_db()
        try:
            conn.execute('UPDATE simo_call_handles SET last_seen=? WHERE email=?', (int(time.time()), email))
            # Events retained for a bounded period. No call recording or media is stored.
            conn.execute('DELETE FROM simo_call_events WHERE created_at < ?', (int(time.time()) - 86400,))
            # Turn expired unanswered ringing calls into durable missed-call records.
            expired = conn.execute('''SELECT id,recipient,caller FROM simo_calls
                WHERE state='ringing' AND created_at<?''',(int(time.time())-120,)).fetchall()
            for call in expired:
                conn.execute("UPDATE simo_calls SET state='ended',updated_at=? WHERE id=?",(int(time.time()),call['id']))
                conn.execute('''INSERT OR IGNORE INTO simo_call_missed(call_id,recipient,caller,created_at)
                    VALUES (?,?,?,?)''',(call['id'],call['recipient'],call['caller'],int(time.time())))
                push(conn,call['id'],call['caller'],'hangup',{},int(time.time()))
            rows = conn.execute('SELECT id,call_id,kind,data FROM simo_call_events WHERE recipient=? AND id>? ORDER BY id LIMIT 70',
                                (email, after)).fetchall()
            conn.commit()
            events = []
            for r in rows:
                if r['kind'] == 'incoming':
                    live = conn.execute('SELECT state,created_at FROM simo_calls WHERE id=?', (r['call_id'],)).fetchone()
                    if not live or live['state'] != 'ringing' or int(time.time()) - int(live['created_at']) > 120:
                        continue
                events.append({'id': r['id'], 'call_id': r['call_id'], 'kind': r['kind'], 'data': json.loads(r['data'])})
            return jsonify({'ok': True, 'events': events})
        finally:
            conn.close()

    @app.route('/api/simo-calling/missed', methods=['GET','POST'])
    def simo_calling_missed():
        email=actor()
        if not email:return response_error('Sign in first.',401)
        if request.method=='POST' and not protect():return response_error('Cross-site request blocked.',403)
        conn=open_db()
        try:
            if request.method=='POST':
                if not request.is_json:return response_error('JSON required.',415)
                data=request.get_json(silent=True) or {}
                call_id=str(data.get('call_id') or '')
                if not call_id:return response_error('Call ID required.')
                conn.execute('UPDATE simo_call_missed SET seen=1 WHERE call_id=? AND recipient=?',(call_id,email))
                conn.commit()
                return jsonify({'ok':True})
            rows=conn.execute('''SELECT m.call_id,m.created_at,h.handle caller_handle
                FROM simo_call_missed m LEFT JOIN simo_call_handles h ON h.email=m.caller
                WHERE m.recipient=? AND m.seen=0 ORDER BY m.created_at DESC LIMIT 25''',(email,)).fetchall()
            return jsonify({'ok':True,'missed':[{'call_id':r['call_id'], 'created_at':r['created_at'],
                'caller_handle':r['caller_handle'] or 'unknown'} for r in rows]})
        finally:conn.close()
