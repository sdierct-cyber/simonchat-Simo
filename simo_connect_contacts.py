"""Simo Connect R10.73 isolated, account-owned private address book.

Nicknames are per-user labels, not unique handles, authentication IDs or aliases.
The Simo Connect sign-in gate covers these routes via /api/simo-connect/.
"""
import re
import time
from flask import jsonify, request

HANDLE = re.compile(r'^[a-z][a-z0-9_]{2,23}$')


def register_simo_connect_contacts(app, get_db, current_user_email):
    def db():
        conn = get_db()
        conn.execute('PRAGMA busy_timeout=5000')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_contacts (
          owner TEXT NOT NULL, contact_email TEXT NOT NULL,
          nickname TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          PRIMARY KEY(owner, contact_email))''')
        conn.commit()
        return conn

    def identity():
        return str(current_user_email() or '').strip().lower()

    def error(message, status=400):
        return jsonify(ok=False, error=message), status

    @app.route('/api/simo-connect/contacts', methods=['GET', 'POST', 'DELETE'])
    def simo_connect_contacts():
        owner = identity()
        if not owner:
            return error('Sign in to Simo Connect.', 401)
        conn = db()
        try:
            if request.method == 'GET':
                rows = conn.execute('''SELECT c.nickname,c.favorite,h.handle
                    FROM simo_connect_contacts c
                    INNER JOIN simo_call_handles h ON h.email=c.contact_email
                    WHERE c.owner=? ORDER BY c.favorite DESC, lower(c.nickname), h.handle
                    LIMIT 150''', (owner,)).fetchall()
                return jsonify(ok=True, contacts=[{'nickname':r['nickname'],
                    'handle':r['handle'], 'favorite':bool(r['favorite'])} for r in rows])
            data = request.get_json(silent=True) or {}
            handle = str(data.get('handle') or '').strip().lower().lstrip('@')
            if not HANDLE.fullmatch(handle):
                return error('Enter a valid Simo handle.')
            row = conn.execute('SELECT email FROM simo_call_handles WHERE handle=?', (handle,)).fetchone()
            if not row:
                return error('That registered Simo handle does not exist.', 404)
            contact_email = str(row['email'])
            if contact_email == owner:
                return error('Your own handle cannot be a contact.')
            if request.method == 'DELETE':
                conn.execute('DELETE FROM simo_connect_contacts WHERE owner=? AND contact_email=?', (owner,contact_email))
                conn.commit()
                return jsonify(ok=True)
            nickname = str(data.get('nickname') or '').strip()
            if not nickname or len(nickname)>48 or any(ord(ch)<32 for ch in nickname):
                return error('Choose a contact nickname of 1–48 printable characters.')
            if not isinstance(data.get('favorite',False),bool):
                return error('Favorite must be true or false.')
            favorite = int(data.get('favorite',False))
            count = conn.execute('SELECT COUNT(*) AS n FROM simo_connect_contacts WHERE owner=?',(owner,)).fetchone()['n']
            exists = conn.execute('SELECT 1 FROM simo_connect_contacts WHERE owner=? AND contact_email=?',(owner,contact_email)).fetchone()
            if count >= 150 and not exists:
                return error('Contacts limit reached (150).', 409)
            conn.execute('''INSERT INTO simo_connect_contacts(owner,contact_email,nickname,favorite,created_at)
                VALUES(?,?,?,?,?) ON CONFLICT(owner,contact_email) DO UPDATE SET
                nickname=excluded.nickname,favorite=excluded.favorite''',
                (owner,contact_email,nickname,favorite,int(time.time())))
            conn.commit()
            return jsonify(ok=True)
        finally:
            conn.close()
