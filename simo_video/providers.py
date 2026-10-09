from dataclasses import dataclass
from typing import Optional
import secrets
import time
import re
import json
import urllib.request
import urllib.error
import os


class ProviderError(RuntimeError):
    pass


@dataclass
class ProviderResult:
    status: str
    provider_job_id: str = ""
    output_url: str = ""
    error: str = ""


class BaseVideoProvider:
    name = "base"

    def create(self, spec: dict) -> ProviderResult:
        raise NotImplementedError

    def poll(self, provider_job_id: str) -> ProviderResult:
        raise NotImplementedError


class MockSimoVideoProvider(BaseVideoProvider):
    """Zero-spend provider used for workflow testing only."""
    name = "mock"

    def create(self, spec: dict) -> ProviderResult:
        # Deliberately returns a Simo-owned mock URI, never a third-party brand.
        token = secrets.token_hex(8)
        return ProviderResult(status="succeeded", provider_job_id=f"mock_{token}", output_url="")

    def poll(self, provider_job_id: str) -> ProviderResult:
        return ProviderResult(status="succeeded", provider_job_id=provider_job_id, output_url="")


class RunwayRouterClient:
    """Server-only Model Router client.

    Dry-run and live generation use the same normalized input. The only difference
    is whether dryRun is present/true, matching the provider's recommended flow.
    """
    api_version = "2024-11-06"

    def __init__(self, api_key: str, config_id: str, api_base: str):
        self.api_key = str(api_key or "").strip()
        self.config_id = str(config_id or "").strip()
        self.api_base = str(api_base or "https://api.dev.runwayml.com").rstrip("/")

    @property
    def configured(self):
        return bool(self.api_key and self.config_id)

    def _compact(self, text, limit):
        text = " ".join(str(text or "").split()).strip()
        if len(text) <= limit:
            return text
        cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-")
        return cut or text[:limit]

    def _continuity_guard(self, spec: dict) -> str:
        """Add only short, subject-aware temporal-stability instructions.

        The old RC2.4 provider prompt appended every helper field plus the full
        internal quality contract. That could make promptText exceed the router
        models' accepted input length even when the user's visible prompt was short.
        RC2.5 compiles a compact provider prompt instead.
        """
        source = " ".join([
            str(spec.get("prompt") or ""),
            str(spec.get("camera") or ""),
            str(spec.get("motion") or ""),
            str(spec.get("negative_prompt") or ""),
        ]).lower()

        if re.search(r"\b(car|sedan|vehicle|truck|suv|motorcycle|motorbike|road|driving|drive)\b", source):
            return (
                "Continuity: keep one identical vehicle for the full shot; forward motion only; "
                "stable front/rear orientation, mirrors, wheels, windows and body; "
                "no morphing, reversing, duplicate parts, perspective flips or camera-side jumps."
            )
        if re.search(r"\b(person|people|woman|man|child|face|hands?|character)\b", source):
            return (
                "Continuity: keep the same person and wardrobe across frames; stable face, hands, "
                "body proportions and direction of motion; no duplicate limbs, identity swaps or sudden viewpoint flips."
            )
        if re.search(r"\b(product|bottle|watch|phone|shoe|bag|furniture|object)\b", source):
            return (
                "Continuity: keep the same product geometry, materials, proportions and markings across frames; "
                "no shape changes, duplicated parts or unexplained viewpoint jumps."
            )
        return (
            "Continuity: keep subjects, geometry, lighting and motion consistent across frames; "
            "no morphing, duplication, sudden direction changes or perspective jumps."
        )

    def _prompt_text(self, spec: dict) -> str:
        """Compile a router-safe provider prompt under a strict character budget.

        Keep the user's main creative request first, then only the most useful
        camera/motion/continuity details. Do not append the full internal quality
        contract or the full Avoid list to promptText.
        """
        parts = []

        # Preserve the user's request as the primary instruction.
        base = self._compact(spec.get("prompt"), 360)
        if base:
            parts.append(base)

        camera = self._compact(spec.get("camera"), 95)
        if camera:
            parts.append("Camera: " + camera)

        motion = self._compact(spec.get("motion"), 85)
        if motion:
            parts.append("Motion: " + motion)

        parts.append(self._continuity_guard(spec))

        # Native-audio instructions are included only when the user asked for them.
        # RC2.6 routes these jobs through a native-audio-only router.
        audio_bits = []
        if spec.get("audio"):
            audio_bits.append("natural synchronized scene ambience")
        if spec.get("music"):
            music = self._compact(spec.get("music_style") or "cinematic music", 45)
            audio_bits.append(music + " soundtrack")
        if spec.get("voiceover"):
            narration = self._compact(spec.get("voiceover_text"), 85)
            voice_style = self._compact(spec.get("voice_style"), 45)
            if narration:
                prefix = (voice_style + ": ") if voice_style else ""
                audio_bits.append(prefix + 'spoken narration: "' + narration + '"')
            else:
                audio_bits.append("spoken narration matching the user's requested voice and wording")
        if audio_bits:
            parts.append("Audio: " + "; ".join(audio_bits) + ". Keep audio synchronized with the visuals.")

        compiled = " ".join(p for p in parts if p).strip()

        # Conservative router-wide ceiling so both selected models remain eligible.
        # This is intentionally below typical model maximums; exact provider/model
        # limits can change and the router may narrow eligibility dynamically.
        return self._compact(compiled, 760)

    def _payload(self, spec: dict, *, dry_run: bool) -> dict:
        input_payload = {
            "promptText": self._prompt_text(spec),
            "aspectRatio": str(spec.get("aspect_ratio") or "16:9"),
            "duration": int(spec.get("duration_seconds") or 5),
        }
        # Audio-capable WAN 3.0 defaults can resolve to 1080p, which can exceed
        # the 150-credit ceiling for a 10-second job. Simo explicitly asks for
        # 720p on protected audio jobs so the router can keep an eligible model.
        if spec.get("resolution"):
            input_payload["resolution"] = str(spec["resolution"])
        payload = {"configId": self.config_id, "input": input_payload}
        if dry_run:
            payload["dryRun"] = True
        return payload

    def _request_json(self, method: str, path: str, payload=None, timeout=45):
        if not self.configured:
            raise ProviderError("Protected video provider connection is not configured.")
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.api_base + path,
            data=data,
            method=method,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + self.api_key,
                "X-Runway-Version": self.api_version,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return json.loads(raw or "{}")
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:1200]
            raise ProviderError(f"Protected video provider request failed ({e.code}). {detail}") from e
        except Exception as e:
            raise ProviderError("Protected video provider could not connect.") from e

    def dry_run(self, spec: dict) -> dict:
        data = self._request_json("POST", "/v1/generate/video", self._payload(spec, dry_run=True), timeout=30)
        routing = data.get("routing") or {}
        resolved = routing.get("resolvedInput") or routing.get("resolvedSettings") or {}
        est = routing.get("estimatedCost") or {}
        credits = est.get("credits")
        if credits is None:
            credits = routing.get("estimatedCredits")
        return {
            "ok": True,
            "dry_run": True,
            "config_id": routing.get("configId") or self.config_id,
            "model": routing.get("model") or "",
            "provider": routing.get("provider") or "",
            "optimize_for": (routing.get("resolvedSettings") or {}).get("optimizeFor") or routing.get("optimizeFor") or "",
            "estimated_provider_credits": int(credits or 0),
            "duration": int(resolved.get("duration") or spec.get("duration_seconds") or 0),
            "aspect_ratio": resolved.get("aspectRatio") or resolved.get("ratio") or spec.get("aspect_ratio") or "",
            "resolution": resolved.get("resolution") or "",
        }

    def create(self, spec: dict) -> ProviderResult:
        # Live request: exact same input as dry-run, simply without dryRun.
        data = self._request_json("POST", "/v1/generate/video", self._payload(spec, dry_run=False), timeout=45)
        task_id = str(data.get("id") or data.get("taskId") or data.get("task_id") or "").strip()
        if not task_id:
            raise ProviderError("Video provider did not return a task id.")
        return ProviderResult(status="queued", provider_job_id=task_id, output_url="")

    def poll(self, provider_job_id: str) -> ProviderResult:
        task_id = str(provider_job_id or "").strip()
        if not task_id:
            raise ProviderError("Missing protected provider task id.")
        data = self._request_json("GET", "/v1/tasks/" + task_id, None, timeout=30)
        raw_status = str(data.get("status") or "").upper()
        status_map = {
            "PENDING": "queued",
            "THROTTLED": "queued",
            "RUNNING": "processing",
            "PROCESSING": "processing",
            "SUCCEEDED": "succeeded",
            "FAILED": "failed",
            "CANCELED": "canceled",
            "CANCELLED": "canceled",
        }
        status = status_map.get(raw_status, "processing" if raw_status else "processing")
        output = data.get("output") or []
        output_url = ""
        if isinstance(output, list) and output:
            output_url = str(output[0] or "").strip()
        elif isinstance(output, str):
            output_url = output.strip()
        error = ""
        if status in {"failed", "canceled"}:
            error = str(data.get("failure") or data.get("error") or "Video generation did not complete.")
        return ProviderResult(status=status, provider_job_id=task_id, output_url=output_url, error=error)


class RunwayRouterProvider(BaseVideoProvider):
    name = "protected_video"

    def __init__(self, config):
        self.config = config
        self.standard_client = RunwayRouterClient(
            config.runway_api_key, config.runway_config_id, config.runway_api_base
        )
        self.audio_client = RunwayRouterClient(
            config.runway_api_key, config.runway_audio_config_id, config.runway_api_base
        )
        self.four_k_client = RunwayRouterClient(
            config.runway_api_key,
            (os.getenv("SIMO_VIDEO_RUNWAY_4K_CONFIG_ID") or "").strip(),
            config.runway_api_base,
        )

    def _client_for(self, spec: dict):
        if str(spec.get("output_resolution") or "").lower() == "4k":
            if not self.four_k_client.configured:
                raise ProviderError("Simo 4K premium routing is not configured yet. No provider generation was billed.")
            return self.four_k_client
        wants_audio = bool(spec.get("audio") or spec.get("music") or spec.get("voiceover"))
        return self.audio_client if wants_audio else self.standard_client

    def create(self, spec: dict) -> ProviderResult:
        return self._client_for(spec).create(spec)

    def poll(self, provider_job_id: str) -> ProviderResult:
        # Task polling is independent of which router created the task.
        return self.standard_client.poll(provider_job_id)


class DisabledLiveProvider(BaseVideoProvider):
    name = "disabled"

    def create(self, spec: dict) -> ProviderResult:
        raise ProviderError("Live video provider is intentionally disabled. No provider call was made.")

    def poll(self, provider_job_id: str) -> ProviderResult:
        raise ProviderError("Live video provider is intentionally disabled.")


def build_provider(config):
    if config.mock_mode or config.provider == "mock":
        return MockSimoVideoProvider()
    if config.provider in {"runway", "router", "protected_video"}:
        return RunwayRouterProvider(config)
    return DisabledLiveProvider()
