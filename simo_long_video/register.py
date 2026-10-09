
import os
from pathlib import Path
from .store import LongVideoStore
from .service import LongVideoService
from .routes import create_blueprint

def _default_long_db(short_config):
    p=Path(short_config.database_path)
    return str(p.with_name("simo_long_video.db"))

def register_simo_long_video(app, short_service):
    path=(os.getenv("SIMO_LONG_VIDEO_DB_PATH") or _default_long_db(short_service.config)).strip()
    store=LongVideoStore(path)
    service=LongVideoService(short_service,store,short_service.credits)
    app.register_blueprint(create_blueprint(service))
    app.extensions["simo_long_video_service"]=service
    return service
