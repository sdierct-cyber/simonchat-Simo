"""SIMO CONNECT R10.63: authenticated, isolated handle-based direct and group messaging.
Local-test beta. Keeps the original calling API and AI/creator pipelines untouched.
No SMS, PSTN, E2EE claims, push delivery or email notifications.
"""
import re
import time
import uuid
import os
import secrets
from pathlib import Path
from werkzeug.utils import secure_filename
from flask import send_file
from urllib.parse import urlsplit
from flask import jsonify, request

HANDLE_RE = re.compile(r'^[a-z][a-z0-9_]{2,23}$')
MAX_BODY = 2000
MAX_MEMBERS = 12
MAX_FILE_BYTES = 5 * 1024 * 1024  # local-test limit
FILE_TYPES = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.csv': 'text/csv',
}


def _allowed_file_content(extension, data):
    if extension == '.png': return data.startswith(b'\x89PNG\r\n\x1a\n')
    if extension in ('.jpg', '.jpeg'): return data.startswith(b'\xff\xd8\xff')
    if extension == '.webp': return data.startswith(b'RIFF') and data[8:12] == b'WEBP'
    if extension == '.pdf': return data.startswith(b'%PDF-')
    if extension in ('.txt', '.csv'):
        if b'\x00' in data: return False
        try: data.decode('utf-8'); return True
        except UnicodeDecodeError: return False
    return False


def register_simo_connect_messages(app, get_db, current_user_email):
    # Local development default is OUTSIDE /static. Set SIMO_CONNECT_PRIVATE_FILES_DIR
    # explicitly to a secured persistent disk path before production deployment.
    file_dir = Path(os.getenv('SIMO_CONNECT_PRIVATE_FILES_DIR') or
                    str(Path(app.instance_path) / 'simo_connect_private_files'))

    def error(message, status=400):
        return jsonify({'ok': False, 'error': message}), status

    def user():
        return str(current_user_email() or '').strip().lower()

    def guard():
        origin = request.headers.get('Origin', '')
        if origin and urlsplit(origin).netloc.lower() != request.host.lower():
            return False
        # JSON-only mutation requests are not sendable through a normal HTML form.
        if request.method == 'POST' and not request.is_json and request.endpoint != 'simo_connect_upload_file':
            return False
        return True

    def db():
        conn = get_db()
        conn.execute('PRAGMA busy_timeout=5000')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_threads (
            id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('direct','group')),
            title TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_members (
            thread_id TEXT NOT NULL, email TEXT NOT NULL,
            PRIMARY KEY(thread_id,email))''')
        conn.execute('CREATE INDEX IF NOT EXISTS sc_member_email ON simo_connect_members(email,thread_id)')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL,
            sender TEXT NOT NULL, body TEXT NOT NULL,
            created_at INTEGER NOT NULL)''')
        conn.execute('CREATE INDEX IF NOT EXISTS sc_message_thread ON simo_connect_messages(thread_id,id)')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_files (
            id TEXT PRIMARY KEY, message_id INTEGER NOT NULL UNIQUE,
            thread_id TEXT NOT NULL, sender TEXT NOT NULL,
            original_name TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE,
            mime TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at INTEGER NOT NULL)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_user_views (
            thread_id TEXT NOT NULL, email TEXT NOT NULL,
            cleared_through_id INTEGER NOT NULL DEFAULT 0,
            hidden INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(thread_id,email))''')
        conn.execute('''CREATE TABLE IF NOT EXISTS simo_connect_read_cursors (
            thread_id TEXT NOT NULL, email TEXT NOT NULL, last_read_id INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(thread_id,email))''')
        conn.commit()
        return conn

    def handle_email(conn, handle):
        cleaned = str(handle or '').strip().lower().lstrip('@')
        if not HANDLE_RE.fullmatch(cleaned):
            return None
        row = conn.execute('SELECT email FROM simo_call_handles WHERE handle=?', (cleaned,)).fetchone()
        return str(row['email']) if row else None

    def my_handle(conn, email):
        row = conn.execute('SELECT handle FROM simo_call_handles WHERE email=?', (email,)).fetchone()
        return str(row['handle']) if row else ''

    def member(conn, thread, email):
        return bool(conn.execute('SELECT 1 FROM simo_connect_members WHERE thread_id=? AND email=?', (thread,email)).fetchone())

    def details(conn, thread_id, email):
        th = conn.execute('SELECT id,kind,title,created_at FROM simo_connect_threads WHERE id=?', (thread_id,)).fetchone()
        if not th or not member(conn,thread_id,email):
            return None
        members = conn.execute('''SELECT h.handle FROM simo_connect_members m
            LEFT JOIN simo_call_handles h ON h.email=m.email WHERE m.thread_id=? ORDER BY h.handle''', (thread_id,)).fetchall()
        handles = [r['handle'] for r in members if r['handle']]
        return {'id':th['id'],'kind':th['kind'],'title':th['title'] or '',
                'members':handles,'created_at':th['created_at']}

    @app.post('/api/simo-connect/threads')
    def simo_connect_thread_create():
        email = user()
        if not email: return error('Please sign in.',401)
        if not guard(): return error('Invalid request origin or content type.',403)
        data = request.get_json(silent=True) or {}
        kind = str(data.get('kind') or 'direct').strip()
        raw = data.get('handles')
        if not isinstance(raw,list): return error('Provide a list of handles.')
        if kind not in ('direct','group'): return error('Invalid conversation type.')
        if not (1 <= len(raw) <= MAX_MEMBERS-1): return error('Choose 1 to 11 people.')
        title = str(data.get('title') or '').strip()[:64]
        if kind == 'group' and not title: return error('Enter a group name.')
        conn = db()
        try:
            if not my_handle(conn,email): return error('Save your Simo handle first.')
            recipient_emails = []
            for handle in raw:
                target = handle_email(conn,handle)
                if not target: return error('Unknown or invalid handle: '+str(handle)[:30],404)
                if target == email: return error('You cannot add yourself as a recipient.')
                if target in recipient_emails: return error('Duplicate handle.')
                recipient_emails.append(target)
            if kind == 'direct' and len(recipient_emails) != 1: return error('A direct chat needs one recipient.')
            if kind == 'group' and len(recipient_emails) < 2: return error('A group needs at least two other members.')
            if kind == 'direct':
                # Avoid duplicate conversations between the same two users.
                old = conn.execute('''SELECT t.id FROM simo_connect_threads t
                    JOIN simo_connect_members ma ON ma.thread_id=t.id AND ma.email=?
                    JOIN simo_connect_members mb ON mb.thread_id=t.id AND mb.email=?
                    WHERE t.kind='direct' AND
                    (SELECT COUNT(*) FROM simo_connect_members x WHERE x.thread_id=t.id)=2
                    ORDER BY t.created_at LIMIT 1''', (email,recipient_emails[0])).fetchone()
                if old:
                    conn.execute('''INSERT INTO simo_connect_user_views(thread_id,email,hidden)
                        VALUES(?,?,0) ON CONFLICT(thread_id,email) DO UPDATE SET hidden=0''',(old['id'],email))
                    conn.commit()
                    return jsonify({'ok':True,'thread':details(conn,old['id'],email)})
            now = int(time.time()); thread_id = str(uuid.uuid4())
            conn.execute('INSERT INTO simo_connect_threads VALUES (?,?,?,?,?,?)',
                         (thread_id,kind,title if kind == 'group' else '',email,now,now))
            for m in [email]+recipient_emails:
                conn.execute('INSERT INTO simo_connect_members VALUES (?,?)',(thread_id,m))
            conn.commit()
            return jsonify({'ok':True,'thread':details(conn,thread_id,email)})
        finally: conn.close()

    @app.get('/api/simo-connect/threads')
    def simo_connect_thread_list():
        email = user()
        if not email: return error('Please sign in.',401)
        conn = db()
        try:
            rows=conn.execute('''SELECT t.id FROM simo_connect_threads t
                JOIN simo_connect_members m ON m.thread_id=t.id
                LEFT JOIN simo_connect_user_views v ON v.thread_id=t.id AND v.email=m.email
                WHERE m.email=? AND COALESCE(v.hidden,0)=0
                ORDER BY t.updated_at DESC LIMIT 80''',(email,)).fetchall()
            return jsonify({'ok':True,'handle':my_handle(conn,email),
                            'threads':[details(conn,r['id'],email) for r in rows]})
        finally: conn.close()

    @app.get('/api/simo-connect/messages')
    def simo_connect_history():
        email=user()
        if not email: return error('Please sign in.',401)
        thread=str(request.args.get('thread') or '')
        try: after=max(0,int(request.args.get('after','0')))
        except (ValueError,TypeError): return error('Invalid cursor.')
        conn=db()
        try:
            if not member(conn,thread,email): return error('Conversation not found.',404)
            rows=conn.execute('''SELECT m.id,m.body,m.created_at,h.handle sender,
                f.id as attachment_id,f.original_name as attachment_name,
                f.mime as attachment_type,f.size_bytes as attachment_size
                FROM simo_connect_messages m LEFT JOIN simo_call_handles h ON h.email=m.sender
                LEFT JOIN simo_connect_files f ON f.message_id=m.id
                WHERE m.thread_id=? AND m.id>MAX(?,COALESCE((SELECT v.cleared_through_id
                  FROM simo_connect_user_views v WHERE v.thread_id=? AND v.email=?),0))
                ORDER BY m.id ASC LIMIT 100''',(thread,after,thread,email)).fetchall()
            return jsonify({'ok':True,'messages':[dict(r) for r in rows]})
        finally:conn.close()

    @app.post('/api/simo-connect/messages')
    def simo_connect_send():
        email=user()
        if not email:return error('Please sign in.',401)
        if not guard():return error('Invalid request origin or content type.',403)
        data=request.get_json(silent=True) or {}
        thread=str(data.get('thread') or '')
        body=str(data.get('body') or '').strip()
        if not body or len(body)>MAX_BODY:return error('Message must contain 1 to 2,000 characters.')
        conn=db()
        try:
            if not member(conn,thread,email):return error('Conversation not found.',404)
            now=int(time.time())
            conn.execute('INSERT INTO simo_connect_messages(thread_id,sender,body,created_at) VALUES (?,?,?,?)',
                         (thread,email,body,now))
            conn.execute('UPDATE simo_connect_threads SET updated_at=? WHERE id=?',(now,thread))
            conn.execute('''UPDATE simo_connect_user_views SET hidden=0
                WHERE thread_id=? AND email<>?''',(thread,email))
            conn.commit()
            return jsonify({'ok':True})
        finally:conn.close()

    @app.get('/api/simo-connect/notifications')
    def simo_connect_notifications():
        email=user()
        if not email:return error('Please sign in.',401)
        conn=db()
        try:
            rows=conn.execute('''SELECT t.id,t.kind,t.title,
                (SELECT COUNT(*) FROM simo_connect_messages m
                 WHERE m.thread_id=t.id AND m.sender<>? AND
                 m.id>MAX(COALESCE((SELECT r.last_read_id FROM simo_connect_read_cursors r
                     WHERE r.thread_id=t.id AND r.email=?),0),
                     COALESCE((SELECT v.cleared_through_id FROM simo_connect_user_views v
                     WHERE v.thread_id=t.id AND v.email=?),0))) unread,
                (SELECT MAX(m.id) FROM simo_connect_messages m
                 WHERE m.thread_id=t.id AND m.sender<>?) latest_id
                FROM simo_connect_threads t JOIN simo_connect_members mem
                ON mem.thread_id=t.id
                LEFT JOIN simo_connect_user_views v ON v.thread_id=t.id AND v.email=mem.email
                WHERE mem.email=? AND COALESCE(v.hidden,0)=0 ORDER BY t.updated_at DESC LIMIT 80''',
                (email,email,email,email,email)).fetchall()
            unread=[{'thread_id':r['id'],'kind':r['kind'],'title':r['title'],
                     'count':r['unread'],'latest_id':r['latest_id']} for r in rows if r['unread']]
            return jsonify({'ok':True,'unread_total':sum(x['count'] for x in unread),'threads':unread})
        finally:conn.close()

    @app.post('/api/simo-connect/read')
    def simo_connect_mark_read():
        email=user()
        if not email:return error('Please sign in.',401)
        if not guard():return error('Invalid request origin or content type.',403)
        data=request.get_json(silent=True) or {}
        thread=str(data.get('thread') or '')
        conn=db()
        try:
            if not member(conn,thread,email):return error('Conversation not found.',404)
            r=conn.execute('SELECT COALESCE(MAX(id),0) as maximum FROM simo_connect_messages WHERE thread_id=?',(thread,)).fetchone()
            maximum=int(r['maximum'])
            conn.execute('''INSERT INTO simo_connect_read_cursors(thread_id,email,last_read_id) VALUES (?,?,?)
                ON CONFLICT(thread_id,email) DO UPDATE SET last_read_id=MAX(last_read_id,excluded.last_read_id)''',
                (thread,email,maximum))
            conn.commit()
            return jsonify({'ok':True,'last_read_id':maximum})
        finally:conn.close()

    @app.post('/api/simo-connect/conversation-view')
    def simo_connect_conversation_view():
        email=user()
        if not email:return error('Please sign in.',401)
        if not guard():return error('Invalid request origin or content type.',403)
        data=request.get_json(silent=True) or {}
        thread=str(data.get('thread') or '')
        action=str(data.get('action') or '')
        if action not in ('clear','hide'):return error('Invalid conversation action.')
        conn=db()
        try:
            if not member(conn,thread,email):return error('Conversation not found.',404)
            latest=conn.execute('SELECT COALESCE(MAX(id),0) AS id FROM simo_connect_messages WHERE thread_id=?',(thread,)).fetchone()['id']
            conn.execute('''INSERT INTO simo_connect_user_views(thread_id,email,cleared_through_id,hidden)
                VALUES(?,?,?,?) ON CONFLICT(thread_id,email) DO UPDATE SET
                cleared_through_id=MAX(cleared_through_id,excluded.cleared_through_id),
                hidden=excluded.hidden''',(thread,email,latest,1 if action=='hide' else 0))
            conn.execute('''INSERT INTO simo_connect_read_cursors(thread_id,email,last_read_id)
                VALUES(?,?,?) ON CONFLICT(thread_id,email) DO UPDATE SET
                last_read_id=MAX(last_read_id,excluded.last_read_id)''',(thread,email,latest))
            conn.commit()
            return jsonify({'ok':True,'action':action,'cleared_through_id':latest})
        finally:conn.close()

    @app.post('/api/simo-connect/files')
    def simo_connect_upload_file():
        email=user()
        if not email:return error('Please sign in.',401)
        # Non-simple custom header is mandatory even when Origin is omitted.
        if not guard() or request.headers.get('X-Simo-Connect-Upload')!='1':
            return error('Upload request denied.',403)
        thread=str(request.form.get('thread') or '')
        incoming=request.files.get('file')
        if not incoming:return error('Choose a file to share.')
        original=secure_filename(str(incoming.filename or ''))[:120]
        suffix=Path(original).suffix.lower()
        if not original or suffix not in FILE_TYPES:
            return error('Allowed: PNG, JPG, WEBP, PDF, TXT and CSV.')
        # Read one byte past limit, so size is enforced even without Content-Length.
        contents=incoming.stream.read(MAX_FILE_BYTES+1)
        if not contents or len(contents)>MAX_FILE_BYTES:
            return error('File must be between 1 byte and 5 MB.',413)
        if not _allowed_file_content(suffix,contents):
            return error('File content does not match the allowed type.')
        conn=db()
        stored=None
        try:
            if not member(conn,thread,email):return error('Conversation not found.',404)
            # Restrictive private directory; do not serve with /static.
            file_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
            key=secrets.token_hex(24)
            destination=file_dir/key
            with destination.open('xb') as f:
                f.write(contents)
            stored=destination
            try:os.chmod(destination,0o600)
            except OSError:pass
            now=int(time.time())
            cursor=conn.execute('''INSERT INTO simo_connect_messages(thread_id,sender,body,created_at)
                VALUES(?,?,?,?)''',(thread,email,'',now))
            attachment_id=str(uuid.uuid4())
            conn.execute('''INSERT INTO simo_connect_files
                (id,message_id,thread_id,sender,original_name,storage_key,mime,size_bytes,created_at)
                VALUES(?,?,?,?,?,?,?,?,?)''',
                (attachment_id,cursor.lastrowid,thread,email,original,key,FILE_TYPES[suffix],len(contents),now))
            conn.execute('UPDATE simo_connect_threads SET updated_at=? WHERE id=?',(now,thread))
            conn.execute('''UPDATE simo_connect_user_views SET hidden=0
                WHERE thread_id=? AND email<>?''',(thread,email))
            conn.commit()
            return jsonify({'ok':True,'attachment_id':attachment_id,'name':original})
        except Exception:
            conn.rollback()
            if stored:
                try:stored.unlink(missing_ok=True)
                except OSError:pass
            raise
        finally:conn.close()

    @app.get('/api/simo-connect/files/<attachment_id>')
    def simo_connect_download_file(attachment_id):
        email=user()
        if not email:return error('Please sign in.',401)
        if not re.fullmatch(r'[0-9a-f-]{36}',attachment_id):return error('File not found.',404)
        conn=db()
        try:
            record=conn.execute('''SELECT f.thread_id,f.original_name,f.storage_key,f.mime
                FROM simo_connect_files f JOIN simo_connect_members m
                ON m.thread_id=f.thread_id WHERE f.id=? AND m.email=?''',
                (attachment_id,email)).fetchone()
            if not record:return error('File not found.',404)
            target=file_dir/record['storage_key']
            if not target.is_file():return error('File no longer available.',404)
            result=send_file(target,as_attachment=True,
                download_name=record['original_name'],mimetype='application/octet-stream',
                conditional=False,max_age=0)
            result.headers['Cache-Control']='private, no-store, max-age=0'
            result.headers['X-Content-Type-Options']='nosniff'
            result.headers['Content-Security-Policy']="default-src 'none'; sandbox"
            return result
        finally:conn.close()
