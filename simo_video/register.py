from .config import VideoConfig
from .store import VideoStore
from .providers import build_provider
from .credits import CreditHooks
from .service import VideoService
from .routes import create_blueprint


def register_simo_video(app, *, owner_fn, reserve_fn=None, release_fn=None, credit_status_fn=None):
    """Add Simo Video without modifying Website Builder/Design routes or libraries."""
    config=VideoConfig.from_env()
    store=VideoStore(config.database_path)
    provider=build_provider(config)
    credits=CreditHooks(reserve_fn,release_fn,credit_status_fn)
    service=VideoService(config,store,provider,credits,owner_fn)
    app.register_blueprint(create_blueprint(service))
    app.extensions["simo_video_service"]=service

    # Separate long-form feature + separate database/library.
    try:
        from simo_long_video import register_simo_long_video
        register_simo_long_video(app, service)
    except Exception as exc:
        print("[SIMO LONG VIDEO] registration failed closed:", str(exc)[:240], flush=True)

    return service
