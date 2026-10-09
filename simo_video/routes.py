from flask import Blueprint, jsonify, render_template, request, send_file
from .credits import CreditDenied


def create_blueprint(service):
    bp=Blueprint("simo_video", __name__)

    @bp.get("/video")
    def workspace():
        return render_template("simo-video.html")

    @bp.get("/api/video/health")
    def health():
        c=service.config
        return jsonify({"ok":True,"feature":"Simo Video","enabled":c.enabled,"mock_mode":c.mock_mode,
                        "provider_live_enabled": bool(c.provider_enabled and not c.provider_kill_switch),
                        "attribution":"Created with Simo"})

    @bp.post("/api/video/quote")
    def quote():
        try:
            spec,q=service.quote(request.get_json(silent=True) or {})
            return jsonify({"ok":True,"quote":q.public_dict(),"interpretation":service.public_interpretation(spec)})
        except Exception as e:
            return jsonify({"ok":False,"error":str(e)}),400

    @bp.post("/api/video/provider-dry-run")
    def provider_dry_run():
        try:
            result = service.protected_provider_dry_run(request.get_json(silent=True) or {})
            return jsonify({"ok":True,"result":result,"creator":"Simo","charged":False})
        except Exception as e:
            return jsonify({"ok":False,"error":str(e),"creator":"Simo","charged":False}),400

    @bp.post("/api/video/generate")
    def generate():
        try:
            job,q=service.generate(request.get_json(silent=True) or {})
            mock_mode = bool(service.config.mock_mode or service.config.provider == "mock")
            return jsonify({
                "ok":True,
                "job":job,
                "quote":q.public_dict() if q is not None else {"required_credits":job.get("required_credits")},
                "creator":"Simo",
                "mock_mode":mock_mode,
                "credits_charged":False if mock_mode else True,
            })
        except CreditDenied as e:
            return e.response
        except Exception as e:
            return jsonify({"ok":False,"error":str(e),"creator":"Simo"}),409

    @bp.get("/api/video/status/<job_id>")
    def status(job_id):
        job = service.refresh_job(job_id)
        if not job:
            return jsonify({"ok":False,"error":"Video project not found."}),404
        return jsonify({"ok":True,"job":job,"creator":"Simo"})

    @bp.get("/api/video/media/<job_id>")
    def media(job_id):
        private_job = service.store.get_private(str(job_id or "").strip(), service.owner())
        if not private_job or str(private_job.get("status") or "") != "succeeded":
            return jsonify({"ok":False,"error":"Video is not ready."}),404
        path = str(private_job.get("local_media_path") or "").strip()
        if not path:
            return jsonify({"ok":False,"error":"Video file is not available."}),404
        return send_file(path, mimetype="video/mp4", as_attachment=False, conditional=True)

    @bp.get("/api/video/library")
    def library():
        return jsonify({"ok":True,"jobs":service.store.list(service.owner()),"library":"Simo Video Library"})

    @bp.post("/api/video/rename")
    def rename():
        data=request.get_json(silent=True) or {}; job_id=str(data.get("id") or "").strip(); title=str(data.get("title") or "").strip()
        if not job_id or not title: return jsonify({"ok":False,"error":"Video id and title are required."}),400
        job=service.store.rename(job_id,service.owner(),title)
        return jsonify({"ok":bool(job),"job":job}) if job else (jsonify({"ok":False,"error":"Video project not found."}),404)

    @bp.post("/api/video/delete")
    def delete():
        data=request.get_json(silent=True) or {}; job_id=str(data.get("id") or "").strip()
        if not job_id: return jsonify({"ok":False,"error":"Video id is required."}),400
        return jsonify({"ok":service.store.delete(job_id,service.owner())})

    return bp
