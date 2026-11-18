"""Opaque, shareable Simo Connect IDs bound to registered account IDs."""

import re
import secrets


def _table_exists(conn, name):
    return conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def resolve_contact_id(conn, contact_id):
    if not isinstance(contact_id, str) or not re.fullmatch(r'[a-f0-9]{32}', contact_id):
        return None
    if not _table_exists(conn, 'simo_connect_identity'):
        return None
    return conn.execute('''
        SELECT h.email, h.handle FROM simo_connect_identity c
        JOIN users u ON u.id=c.account_id
        JOIN simo_call_handles h ON h.email=lower(u.email)
        WHERE c.public_id=?
    ''', (contact_id,)).fetchone()


def get_or_create_contact_id(conn, email):
    if not _table_exists(conn, 'simo_call_handles'):
        return None
    account = conn.execute('''
        SELECT u.id, h.handle FROM users u
        JOIN simo_call_handles h ON h.email=lower(u.email)
        WHERE lower(u.email)=?
    ''', (email,)).fetchone()
    if not account:
        return None
    conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_identity (
        account_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        public_id TEXT NOT NULL UNIQUE
    )''')
    conn.execute('''CREATE TRIGGER IF NOT EXISTS simo_connect_identity_delete_user
        AFTER DELETE ON users BEGIN
            DELETE FROM simo_connect_identity WHERE account_id=OLD.id;
        END
    ''')
    conn.execute('''INSERT INTO simo_connect_identity (account_id, public_id) VALUES (?,?)
        ON CONFLICT(account_id) DO NOTHING''', (account['id'], secrets.token_hex(16)))
    row = conn.execute(
        'SELECT public_id FROM simo_connect_identity WHERE account_id=?', (account['id'],)
    ).fetchone()
    return {'id': row['public_id'], 'handle': account['handle'], 'own': True}
