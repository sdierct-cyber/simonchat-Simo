"""Simo owner-only moderation console. Isolated from creative pipelines.
Configure SIMO_CONTROL_CENTER_OWNER_EMAIL to the verified Google email.
"""
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from functools import wraps
from flask import Response, jsonify, request, session


ACCOUNTS_PER_PAGE = 100

HTML = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Simo Owner Control Center</title><style>
*{box-sizing:border-box}body{margin:0;background:#0b1020;color:#eff5ff;font:16px system-ui,Arial}.wrap{max-width:1100px;margin:35px auto;padding:0 20px}h1{font-size:30px}small,.muted{color:#aab8d0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px}.card,section{border:1px solid #30415e;border-radius:14px;padding:18px;background:#141e32}.n{font-size:30px;font-weight:800}section{margin-top:18px}input,select,button{font:inherit;border-radius:8px;padding:10px}input,select{background:#0b1020;color:white;border:1px solid #52617a}button{cursor:pointer;background:#375bcb;color:white;border:0}button:disabled{opacity:.5;cursor:default}table{width:100%;border-collapse:collapse}td,th{padding:10px 8px;text-align:left;border-bottom:1px solid #30415e;font-size:14px}th{color:#c3d0e5}.scroll{overflow-x:auto}#msg{margin:12px 0;color:#d3e5ff}.danger{color:#ffb2b2}@media(max-width:600px){h1{font-size:24px}}</style></head><body><main class="wrap"><h1>Simo Owner Control Center</h1><p class="muted">Private administration • Only verified owner accounts may access this page</p><div id="msg" role="status"></div><div class="cards"><div class="card">Total users<div class="n" id="total">—</div></div><div class="card">New today (UTC)<div class="n" id="today">—</div></div><div class="card">New this week<div class="n" id="week">—</div></div><div class="card">Suspended / banned<div class="n" id="restricted">—</div></div></div><section><h2>Registered accounts</h2><label>Search email or name <input id="search" maxlength="100" placeholder="Search users"></label> <button id="refresh">Refresh</button><div class="scroll"><table><thead><tr><th>Email</th><th>Name</th><th>Joined (UTC)</th><th>Status</th><th>Manage</th></tr></thead><tbody id="users"></tbody></table></div><p><button id="previous" disabled>Previous</button> <span id="page-info" aria-live="polite"></span> <button id="next" disabled>Next</button></p><p class="muted">Status changes require confirmation and a reason.</p></section><section><h2>Recent moderation actions</h2><div class="scroll"><table><thead><tr><th>When (UTC)</th><th>Account</th><th>Action</th><th>Reason</th></tr></thead><tbody id="audit"></tbody></table></div></section></main><script>
const $=id=>document.getElementById(id);let csrf='',page=1;async function api(url,opts={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opts});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Request failed');return d;}function td(tr,s){let c=document.createElement('td');c.textContent=s??'';tr.appendChild(c);return c;}function note(s,bad=false){$('msg').textContent=s;$('msg').className=bad?'danger':'';}async function load(){try{const query=new URLSearchParams({q:$('search').value,page});let d=await api('/api/owner/users?'+query);csrf=d.csrf;page=d.page;$('page-info').textContent='Page '+page+' of '+d.pages+' ('+d.matches+' accounts)';$('previous').disabled=page<=1;$('next').disabled=page>=d.pages;$('total').textContent=d.counts.total;$('today').textContent=d.counts.today;$('week').textContent=d.counts.week;$('restricted').textContent=d.counts.restricted;$('users').replaceChildren();for(const u of d.users){const tr=document.createElement('tr');td(tr,u.email);td(tr,u.name);td(tr,u.created_at);td(tr,u.status);const cell=document.createElement('td');const sel=document.createElement('select');for(const v of ['active','suspended','banned']){const o=document.createElement('option');o.value=v;o.textContent=v;sel.append(o);}sel.value=u.status;sel.disabled=u.owner;const btn=document.createElement('button');btn.textContent='Apply';btn.disabled=u.owner;btn.onclick=async()=>{const reason=prompt('Reason for changing this account status (required):');if(reason===null)return;if(!reason.trim()){note('A reason is required.',true);return;}if(!confirm('Change '+u.email+' to '+sel.value+'?'))return;try{await api('/api/owner/status',{method:'POST',headers:{'Content-Type':'application/json','X-Simo-Admin-CSRF':csrf},body:JSON.stringify({user_id:u.id,status:sel.value,reason})});note('Status updated.');await load();}catch(e){note(e.message,true);}};cell.append(sel,' ',btn);tr.append(cell);$('users').append(tr);}const a=await api('/api/owner/audit');$('audit').replaceChildren();for(const x of a.events){let tr=document.createElement('tr');td(tr,x.created_at);td(tr,x.target_email);td(tr,x.action);td(tr,x.reason);$('audit').append(tr);}note('Account data loaded.');}catch(e){note(e.message,true);}}$('refresh').onclick=load;$('search').onkeydown=e=>{if(e.key==='Enter')load()};load();</script></body></html>'''


def register_simo_owner_admin(app, get_db, current_user_email):
    owner_email = os.getenv('SIMO_CONTROL_CENTER_OWNER_EMAIL', '').strip().lower()
    def identity():
        return str(current_user_email() or '').strip().lower()
    def is_owner():
        return bool(owner_email and session.get('verified_google_sub')) and identity() == owner_email
    def init():
        with closing(get_db()) as conn, conn:
            conn.execute('''CREATE TABLE IF NOT EXISTS simo_admin_status (
                user_id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','suspended','banned')),
                updated_at TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '')''')
            conn.execute('''CREATE TABLE IF NOT EXISTS simo_admin_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT, actor_email TEXT NOT NULL,
                target_id INTEGER NOT NULL, target_email TEXT NOT NULL,
                action TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)''')
    def err(message, status):
        return jsonify(ok=False,error=message),status
    def owner_only(func):
        @wraps(func)
        def wrapper(*a,**kw):
            if not is_owner(): return err('Owner authorization required.',403)
            return func(*a,**kw)
        return wrapper
    # The original app initializes its users table before this module is registered.
    if owner_email:
        init()

    @app.before_request
    def simo_admin_enforce_status():
        if not owner_email:
            return None
        email = identity()
        if not email or email == owner_email:
            return None
        # Existing signed-in sessions are restricted as well as new logins.
        # Leave logout reachable so an affected user can leave their session.
        if request.path == '/logout': return None
        try:
            with closing(get_db()) as conn, conn:
                row=conn.execute('''SELECT s.status FROM simo_admin_status s
                    JOIN users u ON u.id=s.user_id WHERE lower(u.email)=?''',(email,)).fetchone()
            if row and row['status'] in ('suspended','banned'):
                return err('This Simo account is restricted. Contact support to appeal.',403)
        except sqlite3.OperationalError:
            app.logger.exception('Simo owner status lookup failed')
            return err('Account authorization temporarily unavailable.',503)
        return None
    @app.get('/admin')
    @owner_only
    def simo_owner_page():
        response=Response(HTML,mimetype='text/html')
        response.headers['Cache-Control']='no-store'
        response.headers['X-Frame-Options']='DENY'
        response.headers['Content-Security-Policy']="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        return response
    @app.get('/api/owner/users')
    @owner_only
    def simo_owner_users():
        q = (request.args.get('q') or '').strip().lower()[:100]
        requested_page = request.args.get('page', default=1, type=int)
        search_args = (q, f'%{q}%', f'%{q}%')
        now=datetime.now(timezone.utc)
        today=now.strftime('%Y-%m-%d')
        week_start=now.timestamp()-7*86400
        with closing(get_db()) as conn, conn:
            total=conn.execute('SELECT COUNT(*) n FROM users').fetchone()['n']
            matches = conn.execute(
                "SELECT COUNT(*) AS n FROM users WHERE (?='' OR lower(email) LIKE ? OR lower(COALESCE(name,'')) LIKE ?)",
                search_args,
            ).fetchone()['n']
            pages = max(1, (matches + ACCOUNTS_PER_PAGE - 1) // ACCOUNTS_PER_PAGE)
            page = min(max(requested_page, 1), pages)
            rows=conn.execute('''SELECT u.id,u.email,u.name,u.created_at,
                COALESCE(s.status,'active') status FROM users u
                LEFT JOIN simo_admin_status s ON s.user_id=u.id
                WHERE (?='' OR lower(u.email) LIKE ? OR lower(COALESCE(u.name,'')) LIKE ?)
                ORDER BY u.id DESC LIMIT ? OFFSET ?''',
                (*search_args, ACCOUNTS_PER_PAGE, (page - 1) * ACCOUNTS_PER_PAGE)).fetchall()
            dates=conn.execute('SELECT created_at FROM users WHERE created_at IS NOT NULL').fetchall()
            restricted=conn.execute("SELECT COUNT(*) n FROM simo_admin_status s JOIN users u ON u.id=s.user_id WHERE s.status IN ('suspended','banned')").fetchone()['n']
        def parse_date(v):
            try:
                d=datetime.fromisoformat(str(v).replace('Z','+00:00'))
                return d.replace(tzinfo=timezone.utc).timestamp() if d.tzinfo is None else d.timestamp()
            except (ValueError,TypeError): return None
        vals=[parse_date(x['created_at']) for x in dates]
        vals=[x for x in vals if x is not None]
        from datetime import datetime as D
        today_count=sum(D.fromtimestamp(x,timezone.utc).strftime('%Y-%m-%d')==today for x in vals)
        week_count=sum(x>=week_start for x in vals)
        token=session.get('simo_admin_csrf')
        if not token: token=secrets.token_urlsafe(32); session['simo_admin_csrf']=token
        response=jsonify(ok=True,csrf=token,page=page,pages=pages,matches=matches,counts={'total':total,'today':today_count,'week':week_count,'restricted':restricted},users=[{'id':r['id'],'email':r['email'],'name':r['name'] or '', 'created_at':r['created_at'] or '', 'status':r['status'],'owner':str(r['email']).lower()==owner_email} for r in rows])
        response.headers['Cache-Control']='no-store'
        return response
    @app.get('/api/owner/audit')
    @owner_only
    def simo_owner_audit():
        with closing(get_db()) as conn, conn:
            rows=conn.execute('SELECT target_email, action, reason, created_at FROM simo_admin_audit ORDER BY id DESC LIMIT 50').fetchall()
        response = jsonify(ok=True, events=[dict(row) for row in rows])
        response.headers['Cache-Control'] = 'no-store'
        return response
    @app.post('/api/owner/status')
    @owner_only
    def simo_owner_status():
        origin=request.headers.get('Origin','')
        if origin and origin.rstrip('/') != request.host_url.rstrip('/'):
            return err('Invalid request origin.',403)
        if request.headers.get('Sec-Fetch-Site','').lower()=='cross-site': return err('Cross-site request denied.',403)
        if not request.is_json: return err('JSON request required.',415)
        csrf=session.get('simo_admin_csrf','')
        if not csrf or not secrets.compare_digest(request.headers.get('X-Simo-Admin-CSRF',''),csrf):return err('Invalid CSRF token.',403)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return err('JSON object required.', 400)
        status=data.get('status')
        if status not in ('active','suspended','banned'):return err('Invalid account status.',400)
        reason=str(data.get('reason') or '').strip()
        if not 3<=len(reason)<=500: return err('Reason must be 3–500 characters.',400)
        try: user_id=int(data.get('user_id'))
        except (TypeError,ValueError):return err('Invalid account ID.',400)
        timestamp=datetime.now(timezone.utc).isoformat()
        with closing(get_db()) as conn, conn:
            user=conn.execute('SELECT id,email FROM users WHERE id=?',(user_id,)).fetchone()
            if not user: return err('Account not found.',404)
            if str(user['email']).lower()==owner_email: return err('Cannot restrict owner account.',403)
            conn.execute('''INSERT INTO simo_admin_status(user_id,status,updated_at,reason)
               VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,
               updated_at=excluded.updated_at,reason=excluded.reason''',(user_id,status,timestamp,reason))
            conn.execute('''INSERT INTO simo_admin_audit(actor_email,target_id,target_email,action,reason,created_at)
                VALUES(?,?,?,?,?,?)''',(identity(),user_id,user['email'],status,reason,timestamp))
        return jsonify(ok=True,status=status)
