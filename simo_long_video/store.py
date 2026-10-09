
import json, os, sqlite3, datetime as dt, secrets

class LongVideoStore:
    def __init__(self,path):
        self.path=os.path.abspath(path)
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self._init()

    def _conn(self):
        c=sqlite3.connect(self.path); c.row_factory=sqlite3.Row; return c

    def _init(self):
        c=self._conn()
        c.execute("""CREATE TABLE IF NOT EXISTS simo_long_video_projects(
            id TEXT PRIMARY KEY, owner_key TEXT NOT NULL, title TEXT, prompt TEXT NOT NULL,
            total_seconds INTEGER NOT NULL, scene_seconds INTEGER NOT NULL, scene_count INTEGER NOT NULL,
            status TEXT NOT NULL, required_credits INTEGER NOT NULL DEFAULT 0,
            output_url TEXT, local_media_path TEXT, error TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )""")
        c.execute("""CREATE TABLE IF NOT EXISTS simo_long_video_scenes(
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner_key TEXT NOT NULL,
            scene_index INTEGER NOT NULL, prompt TEXT NOT NULL, spec_json TEXT NOT NULL,
            status TEXT NOT NULL, required_credits INTEGER NOT NULL DEFAULT 0,
            provider_job_id TEXT, local_media_path TEXT, reservation_json TEXT,
            reservation_state TEXT NOT NULL DEFAULT 'none', error TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_simo_long_owner ON simo_long_video_projects(owner_key,updated_at DESC)")
        c.execute("CREATE INDEX IF NOT EXISTS idx_simo_long_scene_project ON simo_long_video_scenes(project_id,scene_index)")
        c.commit(); c.close()

    def create_project(self,owner,title,prompt,total_seconds,scene_seconds,scene_count,required_credits):
        now=dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z")
        pid="slv_"+secrets.token_hex(12); c=self._conn()
        c.execute("""INSERT INTO simo_long_video_projects
          (id,owner_key,title,prompt,total_seconds,scene_seconds,scene_count,status,required_credits,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,'planned',?,?,?)""",
          (pid,owner,title,prompt,int(total_seconds),int(scene_seconds),int(scene_count),int(required_credits),now,now))
        c.commit(); c.close(); return pid

    def add_scene(self,project_id,owner,index,prompt,spec,credits,reservation=None):
        now=dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z")
        sid=f"{project_id}_s{int(index)+1:04d}"; c=self._conn()
        state="reserved" if reservation and not reservation.get("mock") else "none"
        c.execute("""INSERT INTO simo_long_video_scenes
          (id,project_id,owner_key,scene_index,prompt,spec_json,status,required_credits,reservation_json,reservation_state,created_at,updated_at)
          VALUES (?,?,?,?,?,?,'queued',?,?,?,?,?)""",
          (sid,project_id,owner,int(index),prompt,json.dumps(spec,ensure_ascii=False),int(credits),
           json.dumps(reservation or {},ensure_ascii=False),state,now,now))
        c.commit(); c.close(); return sid

    def update_project(self,pid,owner,**changes):
        allowed={"title","status","output_url","local_media_path","error"}
        self._update("simo_long_video_projects","id",pid,owner,allowed,changes)

    def update_scene(self,sid,owner,**changes):
        allowed={"status","provider_job_id","local_media_path","reservation_json","reservation_state","error"}
        self._update("simo_long_video_scenes","id",sid,owner,allowed,changes)

    def _update(self,table,key,value,owner,allowed,changes):
        pairs=[]; vals=[]
        for k,v in changes.items():
            if k in allowed: pairs.append(f"{k}=?"); vals.append(v)
        if not pairs:return
        pairs.append("updated_at=?"); vals.append(dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z"))
        vals += [value,owner]
        c=self._conn(); c.execute(f"UPDATE {table} SET {', '.join(pairs)} WHERE {key}=? AND owner_key=?",vals); c.commit(); c.close()

    def project_private(self,pid,owner):
        c=self._conn(); row=c.execute("SELECT * FROM simo_long_video_projects WHERE id=? AND owner_key=?",(pid,owner)).fetchone(); c.close()
        return dict(row) if row else None

    def scene_private(self,sid,owner):
        c=self._conn(); row=c.execute("SELECT * FROM simo_long_video_scenes WHERE id=? AND owner_key=?",(sid,owner)).fetchone(); c.close()
        if not row:return None
        d=dict(row)
        try:d["spec"]=json.loads(d.get("spec_json") or "{}")
        except:d["spec"]={}
        try:d["reservation"]=json.loads(d.get("reservation_json") or "{}")
        except:d["reservation"]={}
        return d

    def scenes_private(self,pid,owner):
        c=self._conn(); rows=c.execute("SELECT * FROM simo_long_video_scenes WHERE project_id=? AND owner_key=? ORDER BY scene_index",(pid,owner)).fetchall(); c.close()
        out=[]
        for r in rows:
            d=dict(r)
            try:d["spec"]=json.loads(d.get("spec_json") or "{}")
            except:d["spec"]={}
            try:d["reservation"]=json.loads(d.get("reservation_json") or "{}")
            except:d["reservation"]={}
            out.append(d)
        return out

    def project_public(self,pid,owner):
        p=self.project_private(pid,owner)
        if not p:return None
        p.pop("local_media_path",None)
        scenes=self.scenes_private(pid,owner)
        p["scenes"]=[{
            "id":s["id"],"scene_index":s["scene_index"],"status":s["status"],
            "required_credits":s["required_credits"],"error":s.get("error") or ""
        } for s in scenes]
        return p

    def list_projects(self,owner,limit=50):
        c=self._conn(); rows=c.execute("SELECT * FROM simo_long_video_projects WHERE owner_key=? ORDER BY updated_at DESC LIMIT ?",(owner,int(limit))).fetchall(); c.close()
        out=[]
        for r in rows:
            d=dict(r); d.pop("local_media_path",None); out.append(d)
        return out

    def delete(self,pid,owner):
        c=self._conn()
        c.execute("DELETE FROM simo_long_video_scenes WHERE project_id=? AND owner_key=?",(pid,owner))
        c.execute("DELETE FROM simo_long_video_projects WHERE id=? AND owner_key=?",(pid,owner))
        n=c.total_changes; c.commit(); c.close(); return bool(n)
