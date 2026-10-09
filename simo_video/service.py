import re
import os
import json
import urllib.request
from pathlib import Path
from .pricing import VideoPricingEngine
from .providers import ProviderError, RunwayRouterClient
from .credits import CreditDenied


class VideoService:
    def __init__(self, config, store, provider, credits, owner_fn):
        self.config=config; self.store=store; self.provider=provider; self.credits=credits; self.owner_fn=owner_fn
        self.pricing=VideoPricingEngine(config)

    def owner(self):
        value = str(self.owner_fn() or "").strip().lower()
        return value or "guest"

    def sanitize_spec(self, data):
        prompt = re.sub(r"\s+", " ", str(data.get("prompt") or "")).strip()
        if not prompt:
            raise ValueError("Tell Simo what video you want to create.")
        if len(prompt) > self.config.max_prompt_chars:
            raise ValueError("Video prompt is too long.")

        lower = prompt.lower()

        # Natural-language first: users can simply describe the finished video.
        duration_raw = data.get("duration_seconds")
        duration = int(duration_raw or self.config.default_duration_seconds)
        m = re.search(r"\b(\d{1,2})\s*(?:second|seconds|sec|secs|s)\b", lower)
        if m and (not duration_raw or bool(data.get("infer_from_prompt", True))):
            duration = min(self.config.max_duration_seconds, max(1, int(m.group(1))))

        output_resolution = str(data.get("output_resolution") or "1080p").strip().lower()
        if output_resolution in {"1080","1080p","full_hd","full hd"}:
            output_resolution = "1080p"
        elif output_resolution in {"4k","uhd","2160p"}:
            output_resolution = "4k"
        else:
            raise ValueError("Choose 1080p or 4K video output.")

        quality = str(data.get("quality") or "auto").strip().lower()
        if quality in {"", "auto"}:
            if re.search(r"\b(cinematic|feature[- ]film|movie[- ]quality|film[- ]quality|epic)\b", lower):
                quality = "cinematic"
            elif re.search(r"\b(full\s*hd|1080p|high definition)\b", lower):
                quality = "full_hd"
            else:
                quality = "hd"

        aspect = str(data.get("aspect_ratio") or "auto").strip()
        if aspect in {"", "auto"}:
            if re.search(r"\b(vertical|portrait|reel|tiktok|shorts?)\b", lower):
                aspect = "9:16"
            elif re.search(r"\b(square|1\s*:\s*1)\b", lower):
                aspect = "1:1"
            elif re.search(r"\b(4\s*:\s*5|instagram post)\b", lower):
                aspect = "4:5"
            else:
                aspect = "16:9"
        if aspect not in {"16:9","9:16","1:1","4:5"}:
            raise ValueError("Unsupported aspect ratio.")

        audio = bool(data.get("audio")) or bool(re.search(r"\b(sound|audio|ambience|ambient sound|sound effects|sfx)\b", lower))
        music = bool(data.get("music")) or bool(re.search(r"\b(music|score|soundtrack|orchestral|piano|ambient music)\b", lower))
        voiceover = bool(data.get("voiceover")) or bool(re.search(r"\b(voiceover|voice over|narrat(?:e|ion|or))\b", lower))

        voiceover_text = re.sub(r"\s+", " ", str(data.get("voiceover_text") or "")).strip()[:1200]
        # User-friendly natural-language extraction:
        # e.g. "a calm male voiceover saying 'The road ahead is yours.'"
        if voiceover and not voiceover_text:
            patterns = [
                r'\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s+["“]([^"”]{1,500})["”]',
                r"\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s+['‘]([^'’]{1,500})['’]",
            ]
            for pattern in patterns:
                vm = re.search(pattern, prompt, flags=re.I)
                if vm:
                    voiceover_text = re.sub(r"\s+", " ", vm.group(1)).strip()[:1200]
                    break

        voice_style = ""
        if voiceover:
            sm = re.search(
                r"\b((?:(?:calm|warm|deep|friendly|energetic|dramatic|professional|soft|confident)\s+){0,2}(?:male|female)\s+(?:voice|voiceover|narrator))\b",
                lower,
                flags=re.I,
            )
            if sm:
                voice_style = re.sub(r"\s+", " ", sm.group(1)).strip()[:120]

        music_style = re.sub(r"\s+", " ", str(data.get("music_style") or "")).strip()[:300]
        camera = re.sub(r"\s+", " ", str(data.get("camera") or "")).strip()[:300]
        motion = re.sub(r"\s+", " ", str(data.get("motion") or "")).strip()[:300]
        negative = re.sub(r"\s+", " ", str(data.get("negative_prompt") or "")).strip()[:600]

        if not camera:
            camera_terms = []
            for phrase in ("drone", "dolly", "tracking shot", "close-up", "close up", "macro",
                           "wide shot", "orbit", "pan", "tilt", "handheld", "crane"):
                if phrase in lower:
                    camera_terms.append(phrase)
            camera = ", ".join(camera_terms)[:300]

        if not motion:
            motion_terms = []
            for phrase in ("slow motion", "slow elegant motion", "fast motion", "energetic",
                           "realistic physics", "smooth motion", "subtle motion"):
                if phrase in lower:
                    motion_terms.append(phrase)
            motion = ", ".join(motion_terms)[:300]

        if not music_style and music:
            for phrase in ("cinematic orchestral", "orchestral", "ambient", "piano", "upbeat",
                           "dramatic", "electronic", "acoustic"):
                if phrase in lower:
                    music_style = phrase
                    break

        # Simo-owned quality contract. This is passed to the future provider adapter,
        # not shown as provider-specific instructions.
        quality_contract = (
            "Original Simo cinematic creation; sharp subject detail; believable motion and physics; "
            "strong depth and perspective; refined lighting; coherent materials/anatomy; premium color grade; "
            "stable composition; no warped hands/faces, duplicate limbs, random text, watermarks, or jitter. "
            "Match the user's requested scene and style without copying a reference composition."
        )

        return {
            "prompt":prompt,
            "duration_seconds":duration,
            "quality":quality,
            "output_resolution":output_resolution,
            "aspect_ratio":aspect,
            "audio":audio,
            "music":music,
            "voiceover":voiceover,
            "voiceover_text":voiceover_text,
            "voice_style":voice_style,
            "music_style":music_style,
            "resolution":"4k" if output_resolution=="4k" else "1080p",
            "camera":camera,
            "motion":motion,
            "negative_prompt":negative,
            "quality_contract":quality_contract,
            "creator":"Simo",
            "attribution":"Created with Simo"
        }

    def quote(self, data):
        spec=self.sanitize_spec(data)
        q=self.pricing.quote(duration_seconds=spec["duration_seconds"], quality=spec["quality"],
                             audio=spec["audio"], music=spec["music"], voiceover=spec["voiceover"])
        return spec,q

    def _simo_credit_quote_from_provider_credits(self, provider_credits: int, *, premium_4k=False, native_audio=False):
        from math import ceil
        provider_credits = max(0, int(provider_credits or 0))
        provider_cost_usd = provider_credits * 0.01
        if premium_4k:
            max_provider_cost_usd = max(1.0, float(os.getenv("SIMO_VIDEO_4K_MAX_PROVIDER_COST_USD","16.00") or 16.00))
            margin = max(
                self.config.minimum_margin_ratio,
                min(0.90,max(0.0,float(os.getenv("SIMO_VIDEO_4K_MIN_MARGIN_RATIO","0.72") or 0.72)))
            )
        elif native_audio:
            max_provider_cost_usd = max(
                self.config.max_provider_cost_usd,
                float(os.getenv("SIMO_VIDEO_AUDIO_MAX_PROVIDER_COST_USD","2.50") or 2.50),
            )
            margin = max(
                self.config.minimum_margin_ratio,
                min(0.90,max(0.0,float(os.getenv("SIMO_VIDEO_AUDIO_MIN_MARGIN_RATIO","0.65") or 0.65)))
            )
        else:
            max_provider_cost_usd = self.config.max_provider_cost_usd
            margin = self.config.minimum_margin_ratio
        if provider_cost_usd > max_provider_cost_usd:
            raise RuntimeError("This video request exceeds Simo's configured provider-cost safety ceiling.")
        total_cost = provider_cost_usd + self.config.infra_reserve_usd
        if margin >= 1.0:
            raise RuntimeError("Invalid Simo Video margin configuration.")
        required_revenue = total_cost / max(0.001, 1.0 - margin)
        required_simo_credits = max(1, ceil(required_revenue / self.config.net_usd_per_credit))
        revenue = required_simo_credits * self.config.net_usd_per_credit
        actual_margin = (revenue - total_cost) / revenue if revenue else 0.0
        if actual_margin + 1e-9 < margin:
            raise RuntimeError("Simo's minimum video profit margin could not be satisfied.")
        return int(required_simo_credits)

    def protected_provider_dry_run(self, data):
        spec = self.sanitize_spec(data)
        wants_audio = bool(spec.get("audio") or spec.get("music") or spec.get("voiceover"))
        premium_4k = str(spec.get("output_resolution") or "").lower()=="4k"
        if premium_4k:
            selected_config_id=(os.getenv("SIMO_VIDEO_RUNWAY_4K_CONFIG_ID") or "").strip()
            if not selected_config_id:
                raise RuntimeError("Simo 4K premium routing is not configured yet. No provider generation was billed.")
        else:
            selected_config_id = (
                self.config.runway_audio_config_id if wants_audio else self.config.runway_config_id
            )
        client = RunwayRouterClient(
            self.config.runway_api_key,
            selected_config_id,
            self.config.runway_api_base,
        )
        try:
            result = client.dry_run(spec)
        except ProviderError as exc:
            text = str(exc)
            if premium_4k and ("no eligible model" in text.lower() or "400" in text):
                raise RuntimeError(
                    "Simo reached the configured 4K router, but no enabled 4K model accepted this exact request. "
                    "No provider generation was billed."
                ) from exc
            if wants_audio and ("no eligible model" in text.lower() or "400" in text):
                raise RuntimeError(
                    "Simo understood that this video needs sound, but the protected native-audio route "
                    "is not ready for this request. No provider generation was billed."
                ) from exc
            raise
        provider_credits = int(result.get("estimated_provider_credits") or 0)
        if provider_credits <= 0:
            raise RuntimeError("Protected provider dry run did not return an estimated cost.")
        simo_credits = self._simo_credit_quote_from_provider_credits(
            provider_credits,
            premium_4k=premium_4k,
            native_audio=(wants_audio and not premium_4k),
        )
        if premium_4k:
            ceiling_env, ceiling_default = "SIMO_VIDEO_RUNWAY_4K_MAX_CREDITS", "1500"
        elif wants_audio:
            ceiling_env, ceiling_default = "SIMO_VIDEO_RUNWAY_AUDIO_MAX_CREDITS", "250"
        else:
            ceiling_env, ceiling_default = "SIMO_VIDEO_RUNWAY_MAX_CREDITS", "150"
        max_router_credits=max(1,int(os.getenv(ceiling_env,ceiling_default) or ceiling_default))
        if provider_credits > max_router_credits:
            raise RuntimeError("Protected provider dry run exceeded Simo's router credit ceiling.")
        return {
            "ok": True,
            "dry_run": True,
            "duration_seconds": int(result.get("duration") or spec["duration_seconds"]),
            "aspect_ratio": result.get("aspect_ratio") or spec["aspect_ratio"],
            "resolution": result.get("resolution") or "",
            "estimated_provider_credits": provider_credits,
            "estimated_simo_credits": simo_credits,
            "within_provider_ceiling": True,
            "profit_shield_passed": True,
            "delivery": {
                "natural_sound": bool(spec["audio"]),
                "music": bool(spec["music"]),
                "voiceover": bool(spec["voiceover"]),
                "native_audio_route": bool(spec["audio"] or spec["music"] or spec["voiceover"]),
            },
            "message": "Protected provider connection verified. No video was generated and no provider credits were charged.",
        }

    def public_interpretation(self, spec):
        return {
            "duration_seconds": spec["duration_seconds"],
            "quality": spec["quality"],
            "output_resolution": spec.get("output_resolution") or "1080p",
            "aspect_ratio": spec["aspect_ratio"],
            "audio": spec["audio"],
            "music": spec["music"],
            "voiceover": spec["voiceover"],
            "voiceover_text": spec.get("voiceover_text") or "",
            "voice_style": spec.get("voice_style") or "",
            "camera": spec["camera"],
            "motion": spec["motion"],
            "music_style": spec["music_style"],
            "delivery": {
                "natural_sound": bool(spec["audio"]),
                "music": bool(spec["music"]),
                "voiceover": bool(spec["voiceover"]),
            },
            "creator": "Simo",
        }

    def _live_enabled(self):
        return (
            self.config.enabled
            and not self.config.mock_mode
            and self.config.provider != "mock"
            and self.config.provider_enabled
            and not self.config.provider_kill_switch
        )

    def _storage_path_for(self, job_id):
        root = Path(self.config.storage_dir)
        root.mkdir(parents=True, exist_ok=True)
        return root / (str(job_id) + ".mp4")

    def _download_output_to_simo_storage(self, job_id, source_url):
        source_url = str(source_url or "").strip()
        if not source_url.startswith("https://"):
            raise RuntimeError("Provider completed without a valid protected output URL.")
        target = self._storage_path_for(job_id)
        tmp = target.with_suffix(".part")
        max_bytes = max(10_000_000, int(os.getenv("SIMO_VIDEO_MAX_OUTPUT_BYTES", "250000000") or 250000000))
        req = urllib.request.Request(source_url, headers={"User-Agent": "SimoVideo/1.0"})
        total = 0
        try:
            with urllib.request.urlopen(req, timeout=90) as resp, open(tmp, "wb") as fh:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise RuntimeError("Generated video exceeded Simo's configured storage safety limit.")
                    fh.write(chunk)
            if total <= 0:
                raise RuntimeError("Generated video download was empty.")
            os.replace(tmp, target)
            return str(target)
        finally:
            try:
                if tmp.exists():
                    tmp.unlink()
            except Exception:
                pass

    def _mp4_has_audio_track(self, path):
        """Lightweight MP4 validation: look for an audio handler ('soun').

        This avoids adding a local ffmpeg dependency just to verify that the
        delivered MP4 contains an audio stream.
        """
        try:
            needle = b"soun"
            overlap = b""
            with open(path, "rb") as fh:
                while True:
                    chunk = fh.read(1024 * 1024)
                    if not chunk:
                        break
                    block = overlap + chunk
                    # MP4 audio tracks identify their handler type as 'soun'.
                    # Requiring a nearby 'hdlr' marker reduces metadata false positives.
                    pos = 0
                    while True:
                        pos = block.find(needle, pos)
                        if pos < 0:
                            break
                        left = max(0, pos - 32)
                        if b"hdlr" in block[left:pos]:
                            return True
                        pos += 4
                    overlap = block[-64:]
        except Exception:
            return False
        return False

    def _requested_audio(self, spec):
        return bool(spec.get("audio") or spec.get("music") or spec.get("voiceover"))

    def _release_job_reservation_once(self, private_job, reason):
        if not private_job:
            return
        if str(private_job.get("reservation_state") or "") != "reserved":
            return
        reservation = private_job.get("reservation") or {}
        self.credits.release(reservation, reason)
        self.store.update(
            private_job["id"], private_job["owner_key"],
            reservation_state="released",
            reservation_json="{}",
        )

    def generate(self, data):
        if not self.config.enabled:
            raise RuntimeError("Simo Video is not enabled yet.")

        owner = self.owner()
        spec = self.sanitize_spec(data)
        if self.store.active_count(owner) >= self.config.max_active_jobs_per_user:
            raise RuntimeError("Simo is already creating a video for this account. Wait for it to finish before starting another.")

        # Mock mode remains zero-spend and is useful for UI/workflow testing.
        if not self._live_enabled():
            if not self.config.mock_mode and (self.config.provider_kill_switch or not self.config.provider_enabled):
                raise RuntimeError("Simo Video live provider is disabled. No provider call was made.")
            if self.config.mock_mode or self.config.provider == "mock":
                spec_local, q = self.quote(data)
                title=(spec_local["prompt"][:72] + ("…" if len(spec_local["prompt"])>72 else ""))
                job_id=self.store.create_job(owner,title,spec_local["prompt"],spec_local,q.required_credits,{"mock":True})
                self.store.update(job_id,owner,status="creating")
                result=self.provider.create(spec_local)
                self.store.update(job_id,owner,status=result.status,output_url="",error="")
                return self.store.get(job_id,owner), q
            raise RuntimeError("Simo Video live safety gates are not all enabled. No provider call was made.")

        if self.config.object_storage_required_for_live and not self.config.object_storage_ready:
            raise RuntimeError("Simo Video storage protection blocked live generation because durable Simo storage is not marked ready. No provider call was made.")

        # CRITICAL: immediately repeat the real provider dry-run on the server.
        # Never trust a quote displayed in the browser.
        protected = self.protected_provider_dry_run(data)
        required_simo_credits = int(protected["estimated_simo_credits"])
        provider_credits = int(protected["estimated_provider_credits"])

        reservation = None
        job_id = None
        try:
            # Reserve user credits BEFORE the paid provider request.
            reservation = self.credits.reserve(required_simo_credits)
            title=(spec["prompt"][:72] + ("…" if len(spec["prompt"])>72 else ""))
            job_id=self.store.create_job(
                owner,title,spec["prompt"],spec,required_simo_credits,reservation
            )
            self.store.update(job_id,owner,status="creating")

            # Paid call happens only after the provider quote, app ceiling, Profit Shield,
            # storage gate, kill switch, and user-credit reservation have passed.
            result=self.provider.create(spec)
            if result.status not in {"queued","creating","processing","succeeded"}:
                raise ProviderError(result.error or "Simo video generation did not start successfully.")

            self.store.update(
                job_id,owner,
                status=result.status,
                provider_job_id=result.provider_job_id,
                output_url="",
                error="",
            )
            job = self.store.get(job_id,owner)
            job["provider_estimate_credits"] = provider_credits
            job["required_credits"] = required_simo_credits
            return job, None
        except CreditDenied:
            raise
        except Exception:
            if job_id:
                private_job = self.store.get_private(job_id, owner)
                self._release_job_reservation_once(private_job, "video_generation_start_failed")
                self.store.update(job_id,owner,status="failed",error="Video generation did not start.")
            elif reservation is not None:
                self.credits.release(reservation,"video_generation_start_failed")
            raise

    def refresh_job(self, job_id):
        owner = self.owner()
        private_job = self.store.get_private(str(job_id or "").strip(), owner)
        if not private_job:
            return None
        status = str(private_job.get("status") or "")
        if status in {"succeeded","failed","canceled"}:
            return self.store.get(private_job["id"], owner)

        provider_job_id = str(private_job.get("provider_job_id") or "").strip()
        if not provider_job_id:
            return self.store.get(private_job["id"], owner)

        try:
            result = self.provider.poll(provider_job_id)
        except Exception:
            # Do not refund on a temporary polling/network failure; provider task may still be running.
            self.store.update(private_job["id"],owner,error="Simo is waiting for the video service to respond. Refresh again shortly.")
            return self.store.get(private_job["id"], owner)

        if result.status in {"failed","canceled"}:
            self._release_job_reservation_once(private_job, "video_provider_failed")
            self.store.update(
                private_job["id"],owner,
                status=result.status,
                error=result.error or "Video generation did not complete.",
            )
            return self.store.get(private_job["id"], owner)

        if result.status == "succeeded":
            if not result.output_url:
                self.store.update(private_job["id"],owner,status="storage_pending",error="Video finished; Simo is retrieving the result.")
                return self.store.get(private_job["id"], owner)
            try:
                local_path = self._download_output_to_simo_storage(private_job["id"], result.output_url)

                # "Succeeded" means Simo delivered what the user asked for.
                # If sound/music/voiceover was requested, a silent MP4 is a failed delivery.
                if self._requested_audio(private_job.get("spec") or {}) and not self._mp4_has_audio_track(local_path):
                    try:
                        Path(local_path).unlink(missing_ok=True)
                    except Exception:
                        pass
                    self._release_job_reservation_once(private_job, "requested_audio_missing")
                    self.store.update(
                        private_job["id"],owner,
                        status="failed",
                        output_url="",
                        local_media_path="",
                        error="Simo did not receive the requested audio in the finished video, so your Simo Credits were released.",
                    )
                    return self.store.get(private_job["id"], owner)

                internal_url = "/api/video/media/" + private_job["id"]
                self.store.update(
                    private_job["id"],owner,
                    status="succeeded",
                    output_url=internal_url,
                    local_media_path=local_path,
                    error="",
                    reservation_state="consumed",
                    reservation_json="{}",
                )
            except Exception:
                # Provider already succeeded and incurred cost. Do not auto-refund here;
                # keep it retryable rather than silently absorbing a completed provider job.
                self.store.update(
                    private_job["id"],owner,
                    status="storage_pending",
                    error="Video finished; Simo is securing the file. Refresh again shortly.",
                )
            return self.store.get(private_job["id"], owner)

        self.store.update(private_job["id"],owner,status=result.status,error="")
        return self.store.get(private_job["id"], owner)

