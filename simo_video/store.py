import json
import os
import sqlite3
import datetime as dt
import secrets


class VideoStore:
    def __init__(self, path: str):
        self.path = os.path.abspath(path)
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self._init()

    def _conn(self):
        c = sqlite3.connect(self.path)
        c.row_factory = sqlite3.Row
        return c

    def _init(self):
        c = self._conn()
        c.execute("""
        CREATE TABLE IF NOT EXISTS simo_video_jobs (
            id TEXT PRIMARY KEY,
            owner_key TEXT NOT NULL,
            title TEXT,
            prompt TEXT NOT NULL,
            spec_json TEXT NOT NULL,
            status TEXT NOT NULL,
            required_credits INTEGER NOT NULL DEFAULT 0,
            provider_job_id TEXT,
            output_url TEXT,
            attribution TEXT NOT NULL DEFAULT 'Created with Simo',
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        c.execute("CREATE INDEX IF NOT EXISTS idx_simo_video_owner ON simo_video_jobs(owner_key, updated_at DESC)")
        # Migration-safe private accounting/storage metadata.
        cols = {r["name"] for r in c.execute("PRAGMA table_info(simo_video_jobs)").fetchall()}
        if "reservation_json" not in cols:
            c.execute("ALTER TABLE simo_video_jobs ADD COLUMN reservation_json TEXT")
        if "reservation_state" not in cols:
            c.execute("ALTER TABLE simo_video_jobs ADD COLUMN reservation_state TEXT NOT NULL DEFAULT 'none'")
        if "local_media_path" not in cols:
            c.execute("ALTER TABLE simo_video_jobs ADD COLUMN local_media_path TEXT")
        c.commit(); c.close()

    def create_job(self, owner_key, title, prompt, spec, required_credits, reservation=None):
        now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z")
        job_id = "svid_" + secrets.token_hex(12)
        c = self._conn()
        reservation_json = json.dumps(reservation or {}, ensure_ascii=False)
        reservation_state = "reserved" if reservation and not reservation.get("mock") else "none"
        c.execute("""INSERT INTO simo_video_jobs
          (id,owner_key,title,prompt,spec_json,status,required_credits,reservation_json,reservation_state,created_at,updated_at)
          VALUES (?,?,?,?,?,'queued',?,?,?,?,?)""",
          (job_id, owner_key, title, prompt, json.dumps(spec, ensure_ascii=False), int(required_credits),
           reservation_json, reservation_state, now, now))
        c.commit(); c.close()
        return job_id

    def update(self, job_id, owner_key, **changes):
        allowed = {"title","status","provider_job_id","output_url","error","reservation_json","reservation_state","local_media_path"}
        pairs=[]; vals=[]
        for k,v in changes.items():
            if k in allowed:
                pairs.append(f"{k} = ?"); vals.append(v)
        if not pairs:
            return
        pairs.append("updated_at = ?"); vals.append(dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00","Z"))
        vals += [job_id, owner_key]
        c=self._conn(); c.execute(f"UPDATE simo_video_jobs SET {', '.join(pairs)} WHERE id=? AND owner_key=?", vals); c.commit(); c.close()

    def get(self, job_id, owner_key):
        c=self._conn(); row=c.execute("SELECT * FROM simo_video_jobs WHERE id=? AND owner_key=?", (job_id,owner_key)).fetchone(); c.close()
        return self._row(row)


    def get_private(self, job_id, owner_key):
        c=self._conn()
        row=c.execute("SELECT * FROM simo_video_jobs WHERE id=? AND owner_key=?", (job_id,owner_key)).fetchone()
        c.close()
        if not row:
            return None
        d=dict(row)
        try: d["spec"] = json.loads(d.get("spec_json") or "{}")
        except Exception: d["spec"]={}
        try: d["reservation"] = json.loads(d.get("reservation_json") or "{}")
        except Exception: d["reservation"]={}
        return d

    def list(self, owner_key, limit=50):
        c=self._conn(); rows=c.execute("SELECT * FROM simo_video_jobs WHERE owner_key=? ORDER BY updated_at DESC LIMIT ?", (owner_key,int(limit))).fetchall(); c.close()
        return [self._row(r) for r in rows]

    def active_count(self, owner_key):
        c=self._conn(); row=c.execute("SELECT COUNT(*) n FROM simo_video_jobs WHERE owner_key=? AND status IN ('queued','creating','processing','storage_pending')", (owner_key,)).fetchone(); c.close()
        return int(row["n"] or 0)

    def delete(self, job_id, owner_key):
        c=self._conn(); c.execute("DELETE FROM simo_video_jobs WHERE id=? AND owner_key=?", (job_id,owner_key)); n=c.total_changes; c.commit(); c.close(); return bool(n)

    def rename(self, job_id, owner_key, title):
        self.update(job_id, owner_key, title=str(title or "").strip()[:160]); return self.get(job_id, owner_key)

    def _row(self, row):
        if not row: return None
        d=dict(row)
        try: d["spec"] = json.loads(d.pop("spec_json") or "{}")
        except Exception: d["spec"]={}
        d.pop("provider_job_id", None)  # provider identity/id is server-private
        d.pop("reservation_json", None)
        d.pop("reservation_state", None)
        d.pop("local_media_path", None)
        return d
