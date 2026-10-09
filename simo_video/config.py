import os
from dataclasses import dataclass
from pathlib import Path


def _bool(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _int(name, default):
    try:
        return int(os.getenv(name, str(default)) or default)
    except Exception:
        return int(default)


def _float(name, default):
    try:
        return float(os.getenv(name, str(default)) or default)
    except Exception:
        return float(default)


def _default_video_db():
    main_db = (os.getenv("DB_PATH") or "").strip()
    if main_db:
        return str(Path(main_db).with_name("simo_video.db"))
    return "simo_video.db"


def _default_storage_dir():
    main_db = (os.getenv("DB_PATH") or "").strip()
    if main_db:
        return str(Path(main_db).parent / "simo_video_storage")
    return "simo_video_storage"


@dataclass(frozen=True)
class VideoConfig:
    enabled: bool
    mock_mode: bool
    provider: str
    provider_enabled: bool
    provider_kill_switch: bool
    max_duration_seconds: int
    default_duration_seconds: int
    max_prompt_chars: int
    minimum_margin_ratio: float
    net_usd_per_credit: float
    provider_cost_per_second_usd: float
    hd_multiplier: float
    full_hd_multiplier: float
    cinematic_multiplier: float
    audio_surcharge_usd: float
    music_surcharge_usd: float
    voiceover_surcharge_usd: float
    infra_reserve_usd: float
    max_provider_cost_usd: float
    max_active_jobs_per_user: int
    database_path: str
    storage_dir: str
    object_storage_required_for_live: bool
    object_storage_ready: bool
    runway_api_key: str
    runway_config_id: str
    runway_audio_config_id: str
    runway_api_base: str

    @classmethod
    def from_env(cls):
        return cls(
            enabled=_bool("SIMO_VIDEO_ENABLED", True),
            mock_mode=_bool("SIMO_VIDEO_MOCK_MODE", True),
            provider=(os.getenv("SIMO_VIDEO_PROVIDER") or "mock").strip().lower(),
            provider_enabled=_bool("SIMO_VIDEO_PROVIDER_ENABLED", False),
            provider_kill_switch=_bool("SIMO_VIDEO_PROVIDER_KILL_SWITCH", True),
            max_duration_seconds=max(1, _int("SIMO_VIDEO_MAX_DURATION_SECONDS", 30)),
            default_duration_seconds=max(1, _int("SIMO_VIDEO_DEFAULT_DURATION_SECONDS", 5)),
            max_prompt_chars=max(200, _int("SIMO_VIDEO_MAX_PROMPT_CHARS", 4000)),
            minimum_margin_ratio=min(0.95, max(0.0, _float("SIMO_VIDEO_MIN_MARGIN_RATIO", 0.65))),
            net_usd_per_credit=max(0.001, _float("SIMO_VIDEO_NET_USD_PER_CREDIT", 0.115)),
            provider_cost_per_second_usd=max(0.0, _float("SIMO_VIDEO_PROVIDER_COST_PER_SECOND_USD", 0.10)),
            hd_multiplier=max(1.0, _float("SIMO_VIDEO_HD_MULTIPLIER", 1.0)),
            full_hd_multiplier=max(1.0, _float("SIMO_VIDEO_FULL_HD_MULTIPLIER", 1.35)),
            cinematic_multiplier=max(1.0, _float("SIMO_VIDEO_CINEMATIC_MULTIPLIER", 1.75)),
            audio_surcharge_usd=max(0.0, _float("SIMO_VIDEO_AUDIO_SURCHARGE_USD", 0.10)),
            music_surcharge_usd=max(0.0, _float("SIMO_VIDEO_MUSIC_SURCHARGE_USD", 0.20)),
            voiceover_surcharge_usd=max(0.0, _float("SIMO_VIDEO_VOICEOVER_SURCHARGE_USD", 0.25)),
            infra_reserve_usd=max(0.0, _float("SIMO_VIDEO_INFRA_RESERVE_USD", 0.20)),
            max_provider_cost_usd=max(0.10, _float("SIMO_VIDEO_MAX_PROVIDER_COST_USD", 8.00)),
            max_active_jobs_per_user=max(1, _int("SIMO_VIDEO_MAX_ACTIVE_JOBS_PER_USER", 1)),
            database_path=(os.getenv("SIMO_VIDEO_DB_PATH") or _default_video_db()).strip(),
            storage_dir=(os.getenv("SIMO_VIDEO_STORAGE_DIR") or _default_storage_dir()).strip(),
            object_storage_required_for_live=_bool("SIMO_VIDEO_REQUIRE_OBJECT_STORAGE", True),
            object_storage_ready=_bool("SIMO_VIDEO_OBJECT_STORAGE_READY", False),
            runway_api_key=(os.getenv("RUNWAY_API_KEY") or os.getenv("RUNWAYML_API_SECRET") or "").strip(),
            runway_config_id=(os.getenv("SIMO_VIDEO_RUNWAY_CONFIG_ID") or "simo-premium-video").strip(),
            runway_audio_config_id=(os.getenv("SIMO_VIDEO_RUNWAY_AUDIO_CONFIG_ID") or "simo-premium-video-audio").strip(),
            runway_api_base=(os.getenv("SIMO_VIDEO_RUNWAY_API_BASE") or "https://api.dev.runwayml.com").strip().rstrip("/"),
        )
