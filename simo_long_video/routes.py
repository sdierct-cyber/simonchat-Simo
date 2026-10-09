
from flask import Blueprint, jsonify, render_template, request, send_file
from simo_video.credits import CreditDenied

def create_blueprint(service):
    bp=Blueprint("simo_long_video",__name__)

    @bp.get("/video/long")
    def workspace(): return render_template("simo-long-video.html")

    @bp.post("/api/long-video/plan")
    def plan():
        try:return jsonify({"ok":True,"plan":service.plan(request.get_json(silent=True) or {})})
        except Exception as e:return jsonify({"ok":False,"error":str(e)}),400

    @bp.post("/api/long-video/start")
    def start():
        try:return jsonify({"ok":True,"project":service.start(request.get_json(silent=True) or {})})
        except CreditDenied as e:return e.response
        except Exception as e:return jsonify({"ok":False,"error":str(e)}),409

    @bp.get("/api/long-video/status/<pid>")
    def status(pid):
        p=service.refresh(pid)
        if not p:return jsonify({"ok":False,"error":"Long video project not found."}),404
        return jsonify({"ok":True,"project":p})

    @bp.get("/api/long-video/library")
    def library():
        return jsonify({"ok":True,"projects":service.store.list_projects(service.owner()),"library":"Simo Long Video Library"})

    @bp.get("/api/long-video/media/<pid>")
    def media(pid):
        p=service.store.project_private(pid,service.owner())
        if not p or p.get("status")!="succeeded" or not p.get("local_media_path"):
            return jsonify({"ok":False,"error":"Final long video is not ready."}),404
        return send_file(p["local_media_path"],mimetype="video/mp4",as_attachment=False,conditional=True)

    @bp.post("/api/long-video/delete")
    def delete():
        d=request.get_json(silent=True) or {}; pid=str(d.get("id") or "").strip()
        return jsonify({"ok":bool(pid and service.store.delete(pid,service.owner()))})

    return bp
