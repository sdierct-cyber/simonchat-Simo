
import os, re, json, math, subprocess, shutil
from pathlib import Path
from simo_video.providers import RunwayRouterClient, ProviderError

class LongVideoService:
    def __init__(self, short_service, store, credits):
        self.short=short_service
        self.config=short_service.config
        self.store=store
        self.credits=credits

    def owner(self): return self.short.owner()

    def parse_duration(self,data):
        prompt=str(data.get("prompt") or "")
        explicit=data.get("total_seconds")
        if explicit:
            return max(10,int(explicit))
        lower=prompt.lower()
        h=re.search(r"\b(\d+(?:\.\d+)?)\s*(?:hour|hours|hr|hrs)\b",lower)
        m=re.search(r"\b(\d+(?:\.\d+)?)\s*(?:minute|minutes|min|mins)\b",lower)
        s=re.search(r"\b(\d+)\s*(?:second|seconds|sec|secs)\b",lower)
        total=0
        if h: total += int(float(h.group(1))*3600)
        if m: total += int(float(m.group(1))*60)
        if s: total += int(s.group(1))
        return total or 60

    def _scene_len(self, base_spec):
        # With current 150-provider-credit cap, 10s keeps native-audio routes eligible.
        return 10 if (base_spec.get("audio") or base_spec.get("music") or base_spec.get("voiceover")) else 10


    def _storyboard_template(self, prompt, count):
        """Create a distinct scene progression without exposing provider details.

        This is intentionally deterministic and subject-aware so Simo does not pay
        for repeated near-identical clips. It can later be replaced by an AI planner
        without changing the long-form storage/generation contract.
        """
        lower = str(prompt or "").lower()

        if re.search(r"\b(car|sedan|vehicle|truck|suv|motorcycle|road|driving|drive)\b", lower):
            beats = [
                ("Establishing", "wide establishing view of the environment and route; introduce the same hero vehicle clearly"),
                ("Tracking", "rear three-quarter tracking shot; steady forward motion; preserve exact vehicle identity and direction"),
                ("Detail", "premium detail shot of wheels, body reflections, road texture, and surrounding environment; same vehicle"),
                ("Side motion", "smooth side tracking shot through the environment; consistent speed, geometry, lighting, and road direction"),
                ("Hero wide", "cinematic wide hero shot revealing scale and scenery while keeping the exact same vehicle"),
                ("Closing", "polished final reveal/closing shot with premium composition and a natural visual resolution"),
            ]
        elif re.search(r"\b(person|people|woman|man|child|character|host|presenter)\b", lower):
            beats = [
                ("Establishing", "establish the location and introduce the same person clearly"),
                ("Medium action", "medium shot of the same person performing the main action; preserve identity, wardrobe, and direction"),
                ("Detail", "close-up detail that supports the story while preserving face, hands, wardrobe, and environment"),
                ("Progression", "advance the action naturally with the same person and continuous setting"),
                ("Hero moment", "strong cinematic moment that shows the result, emotion, or key turning point"),
                ("Closing", "clean final shot that resolves the sequence naturally"),
            ]
        elif re.search(r"\b(product|bottle|watch|phone|shoe|bag|furniture|cosmetic|jewelry)\b", lower):
            beats = [
                ("Establishing", "introduce the same product in a premium environment; preserve exact geometry and materials"),
                ("Feature", "show the main product feature or use case with precise consistent form"),
                ("Detail", "macro/detail shot highlighting materials, texture, finish, controls, or craftsmanship"),
                ("Use", "show the product in a believable use context while preserving the exact same product"),
                ("Hero", "premium hero composition emphasizing desirability and scale"),
                ("Closing", "clean final product reveal with polished commercial framing"),
            ]
        else:
            beats = [
                ("Establishing", "establish the setting, main subject, visual language, and direction of the story"),
                ("Development", "advance the subject or action naturally without resetting the world"),
                ("Detail", "show a meaningful close-up or detail that adds information and visual variety"),
                ("Progression", "continue the story with a distinct angle or action while preserving continuity"),
                ("Hero moment", "deliver the strongest visual or narrative moment of the sequence"),
                ("Closing", "resolve the sequence with a polished closing image that feels complete"),
            ]

        # Expand or compress beats to the exact scene count while keeping a beginning,
        # middle, and ending instead of repeating one generic scene.
        if count <= len(beats):
            if count == 1:
                return [beats[-1]]
            picks = []
            for i in range(count):
                pos = round(i * (len(beats)-1) / max(1, count-1))
                picks.append(beats[pos])
            return picks

        out = []
        for i in range(count):
            base = beats[i % len(beats)]
            cycle = i // len(beats)
            if cycle == 0:
                out.append(base)
            else:
                out.append((base[0] + f" {cycle+1}", base[1] + "; continue from the prior scene with a fresh composition, not a repeat"))
        return out

    def _scene_prompt(self,base_prompt,index,count,beat=None):
        beat_title, beat_instruction = beat or ("Scene", "advance the story naturally with a distinct composition")
        return (
            f"{base_prompt} Scene {index+1} of {count} — {beat_title}. "
            f"Shot purpose: {beat_instruction}. "
            "Continue the same production with consistent subject identity, visual style, lighting, color grade, "
            "wardrobe/objects, geography, and direction of motion. Connect naturally to adjacent scenes. "
            "Do not reset the subject, duplicate it, reverse requested motion, or repeat the previous composition."
        )

    def _split_voiceover(self,text,count):
        text=" ".join(str(text or "").split()).strip()
        if not text:return [""]*count
        words=text.split()
        chunks=[]
        for i in range(count):
            a=round(i*len(words)/count); b=round((i+1)*len(words)/count)
            chunks.append(" ".join(words[a:b]))
        return chunks

    def plan(self,data):
        prompt=" ".join(str(data.get("prompt") or "").split()).strip()
        if not prompt: raise ValueError("Tell Simo what long video you want to create.")
        total=self.parse_duration(data)
        max_total=max(60,int(os.getenv("SIMO_LONG_VIDEO_MAX_SECONDS","43200") or 43200))
        if total>max_total:
            raise ValueError(f"This Simo Long Video workspace currently supports up to {max_total//60} minutes per project.")
        # Long-form natural-language inference should not require users to know
        # which audio boxes to check. Normalize common phrasing before delegating
        # to the protected short-video sanitizer.
        inferred=dict(data)
        lower=prompt.lower()

        if re.search(r"\b(sound|audio|ambience|ambient sound|road ambience|ocean ambience|sound effects|sfx)\b", lower):
            inferred["audio"]=True
        if re.search(r"\b(music|score|soundtrack|orchestral|piano|ambient music|electronic|acoustic)\b", lower):
            inferred["music"]=True
        if re.search(r"\b(voiceover|voice over|narrat(?:e|ion|or))\b", lower):
            inferred["voiceover"]=True

        if inferred.get("voiceover") and not str(inferred.get("voiceover_text") or "").strip():
            voice_patterns=[
                r'\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s*:?\s*["“]([^"”]{1,800})["”]',
                r"\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s*:?\s*['‘]([^'’]{1,800})['’]",
            ]
            for pattern in voice_patterns:
                vm=re.search(pattern,prompt,flags=re.I)
                if vm:
                    inferred["voiceover_text"]=" ".join(vm.group(1).split())[:1200]
                    break

        if inferred.get("music") and not str(inferred.get("music_style") or "").strip():
            for phrase in ("gentle cinematic orchestral","cinematic orchestral","ambient piano","upbeat electronic",
                           "orchestral","ambient","piano","electronic","acoustic","dramatic"):
                if phrase in lower:
                    inferred["music_style"]=phrase
                    break

        output_resolution=str(inferred.get("output_resolution") or "1080p").strip().lower()
        if output_resolution not in {"1080p","4k"}:
            raise ValueError("Choose 1080p or 4K output.")
        inferred["output_resolution"]=output_resolution

        base=self.short.sanitize_spec({**inferred,"duration_seconds":10,"infer_from_prompt":True})

        # Find the longest protected scene size under the fixed per-call ceiling.
        scene_len=None
        last_error=None
        for candidate in [10,8,6,5,4]:
            try:
                q=self.short.protected_provider_dry_run({**base,"duration_seconds":candidate})
                scene_len=candidate
                break
            except Exception as exc:
                last_error=exc
        if scene_len is None:
            raise RuntimeError(
                "Simo could not find a protected scene size for this output quality. "
                "No provider generation was billed. " + (str(last_error) if last_error else "")
            )

        count=int(math.ceil(total/scene_len))
        qsec,rem=divmod(total,count)
        durations=[qsec+(1 if i<rem else 0) for i in range(count)]
        if max(durations)>scene_len or min(durations)<4:
            raise RuntimeError("Simo could not safely segment this duration. No provider generation was billed.")

        voice_chunks=self._split_voiceover(base.get("voiceover_text"),count)

        quote_by_duration={}
        for dur in sorted(set(durations),reverse=True):
            quote_by_duration[dur]=self.short.protected_provider_dry_run({**base,"duration_seconds":dur})

        scene_credits=sum(int(quote_by_duration[d]["estimated_simo_credits"]) for d in durations)
        provider_credits=sum(int(quote_by_duration[d]["estimated_provider_credits"]) for d in durations)
        markup_env="SIMO_LONG_VIDEO_4K_ORCHESTRATION_MARKUP" if output_resolution=="4k" else "SIMO_LONG_VIDEO_ORCHESTRATION_MARKUP"
        markup_default="0.15" if output_resolution=="4k" else "0.10"
        orchestration=max(5,int(math.ceil(scene_credits*float(os.getenv(markup_env,markup_default) or markup_default))))
        total_simo=scene_credits+orchestration

        storyboard=self._storyboard_template(prompt,count)
        scenes=[]
        for i,dur in enumerate(durations):
            beat=storyboard[i]
            sp={**base,"duration_seconds":dur,"prompt":self._scene_prompt(prompt,i,count,beat)}
            if sp.get("voiceover") and voice_chunks[i]:
                sp["voiceover_text"]=voice_chunks[i]
            scenes.append({
                "scene_index":i,"duration_seconds":dur,
                "summary":f"Scene {i+1}: {beat[0]}",
                "description":beat[1],
                "required_credits":int(quote_by_duration[dur]["estimated_simo_credits"]),
                "provider_estimate_credits":int(quote_by_duration[dur]["estimated_provider_credits"]),
                "spec":sp
            })

        return {
            "prompt":prompt,"total_seconds":total,"scene_seconds":scene_len,"scene_count":count,
            "output_resolution":output_resolution,
            "scene_credits":scene_credits,"orchestration_credits":orchestration,
            "required_credits":total_simo,"provider_estimate_credits":provider_credits,
            "scenes":scenes,
            "delivery":{
                "audio":bool(base.get("audio")),"music":bool(base.get("music")),
                "voiceover":bool(base.get("voiceover")),
                "voiceover_text":base.get("voiceover_text") or "",
                "voice_style":base.get("voice_style") or "",
                "music_style":base.get("music_style") or "",
                "negative_prompt":base.get("negative_prompt") or "",
                "aspect_ratio":base.get("aspect_ratio"),
                "quality":base.get("quality"),
                "output_resolution":output_resolution
            }
        }

    def start(self,data):
        plan=self.plan(data); owner=self.owner()
        title=(plan["prompt"][:80]+("…" if len(plan["prompt"])>80 else ""))
        # Escrow-like reservations: reserve EVERY quoted component before provider spend.
        # Scene generation and orchestration/assembly are accounted separately so the
        # customer is charged the quoted total, not just the provider scenes.
        # Customer-facing business protection: verify the account can cover the
        # ENTIRE quoted production before reserving the first scene. This avoids
        # confusing "need 30 credits" messages for a 66-credit project.
        status=self.credits.status()
        if isinstance(status,dict):
            remaining=status.get("remaining")
            try:
                remaining=int(remaining) if remaining is not None else None
            except Exception:
                remaining=None
            if remaining is not None and remaining < int(plan["required_credits"]):
                raise RuntimeError(
                    f"This long-video project requires {int(plan['required_credits'])} Simo Credits total. "
                    f"You currently have {remaining}. Add credits or enable Auto-Reload before creating. "
                    "No provider call was made."
                )

        reservations=[]
        orchestration_reservation=None
        try:
            for scene in plan["scenes"]:
                reservations.append(self.credits.reserve(scene["required_credits"],action="long_video_scene"))
            orchestration_reservation=self.credits.reserve(
                plan["orchestration_credits"],action="long_video_orchestration"
            )
        except Exception:
            for r in reservations:self.credits.release(r,"long_video_preflight_failed")
            if orchestration_reservation:
                self.credits.release(orchestration_reservation,"long_video_preflight_failed")
            raise

        pid=self.store.create_project(
            owner,title,plan["prompt"],plan["total_seconds"],plan["scene_seconds"],
            plan["scene_count"],plan["required_credits"],orchestration_reservation
        )
        for scene,res in zip(plan["scenes"],reservations):
            self.store.add_scene(pid,owner,scene["scene_index"],scene["spec"]["prompt"],scene["spec"],scene["required_credits"],res)
        self.store.update_project(pid,owner,status="creating")
        self._start_next_scene(pid,owner)
        return self.store.project_public(pid,owner)

    def _client_for(self,spec):
        if str(spec.get("output_resolution") or "").lower()=="4k":
            cid=(os.getenv("SIMO_VIDEO_RUNWAY_4K_CONFIG_ID") or "").strip()
            if not cid:
                raise ProviderError("Simo 4K premium routing is not configured. No provider generation was billed.")
        else:
            cid=self.config.runway_audio_config_id if (spec.get("audio") or spec.get("music") or spec.get("voiceover")) else self.config.runway_config_id
        return RunwayRouterClient(self.config.runway_api_key,cid,self.config.runway_api_base)

    def _start_next_scene(self,pid,owner):
        scenes=self.store.scenes_private(pid,owner)
        for s in scenes:
            if s["status"]=="queued":
                # Re-check exact scene cost immediately before paid call.
                q=self.short.protected_provider_dry_run(s["spec"])
                if int(q["estimated_simo_credits"])>int(s["required_credits"]):
                    self._fail_scene_and_release_future(pid,owner,s["id"],"Protected scene price changed before generation.")
                    return
                result=self._client_for(s["spec"]).create(s["spec"])
                self.store.update_scene(s["id"],owner,status=result.status,provider_job_id=result.provider_job_id,error="")
                return
        self._assemble(pid,owner)

    def _release_orchestration_once(self,pid,owner,reason):
        p=self.store.project_private(pid,owner)
        if not p or str(p.get("orchestration_reservation_state") or "")!="reserved":
            return
        self.credits.release(p.get("orchestration_reservation") or {},reason)
        self.store.update_project(
            pid,owner,
            orchestration_reservation_state="released",
            orchestration_reservation_json="{}",
        )

    def _consume_orchestration(self,pid,owner):
        p=self.store.project_private(pid,owner)
        if not p or str(p.get("orchestration_reservation_state") or "")!="reserved":
            return
        self.store.update_project(
            pid,owner,
            orchestration_reservation_state="consumed",
            orchestration_reservation_json="{}",
        )

    def _release_once(self,s,reason):
        if str(s.get("reservation_state") or "")!="reserved":return
        self.credits.release(s.get("reservation") or {},reason)
        self.store.update_scene(s["id"],s["owner_key"],reservation_state="released",reservation_json="{}")

    def _fail_scene_and_release_future(self,pid,owner,sid,reason):
        scenes=self.store.scenes_private(pid,owner)
        for s in scenes:
            if s["id"]==sid:
                self._release_once(s,"long_video_scene_failed")
                self.store.update_scene(s["id"],owner,status="failed",error=reason)
            elif s["status"]=="queued":
                self._release_once(s,"long_video_unstarted_scene_released")
                self.store.update_scene(s["id"],owner,status="canceled",error="Project stopped before this scene was generated.")
        self._release_orchestration_once(pid,owner,"long_video_project_failed")
        self.store.update_project(pid,owner,status="failed",error=reason)

    def refresh(self,pid):
        owner=self.owner(); p=self.store.project_private(pid,owner)
        if not p:return None
        if p["status"] in {"succeeded","failed","canceled"}:return self.store.project_public(pid,owner)
        scenes=self.store.scenes_private(pid,owner)
        active=next((s for s in scenes if s["status"] in {"queued","creating","processing","storage_pending"} and s.get("provider_job_id")),None)
        if active:
            try:r=self._client_for(active["spec"]).poll(active["provider_job_id"])
            except Exception:
                return self.store.project_public(pid,owner)
            if r.status in {"failed","canceled"}:
                self._fail_scene_and_release_future(pid,owner,active["id"],r.error or "A scene failed to generate.")
                return self.store.project_public(pid,owner)
            if r.status=="succeeded":
                try:
                    path=self._download_scene(pid,active["id"],r.output_url)
                    self.store.update_scene(active["id"],owner,status="succeeded",local_media_path=path,reservation_state="consumed",reservation_json="{}",error="")
                    self._start_next_scene(pid,owner)
                except Exception as exc:
                    self._fail_scene_and_release_future(pid,owner,active["id"],f"Simo could not secure scene {active['scene_index']+1}: {exc}")
            else:self.store.update_scene(active["id"],owner,status=r.status,error="")
        else:self._start_next_scene(pid,owner)
        return self.store.project_public(pid,owner)

    def _download_scene(self,pid,sid,url):
        if not str(url).startswith("https://"):raise RuntimeError("Provider returned no secure scene URL.")
        root=Path(self.config.storage_dir)/"long_video"/pid; root.mkdir(parents=True,exist_ok=True)
        target=root/(sid+".mp4")
        import urllib.request
        with urllib.request.urlopen(url,timeout=120) as resp, open(target,"wb") as fh:
            shutil.copyfileobj(resp,fh)
        return str(target)

    def _assemble(self,pid,owner):
        scenes=self.store.scenes_private(pid,owner)
        if not scenes or any(s["status"]!="succeeded" for s in scenes):return
        ffmpeg=shutil.which(os.getenv("SIMO_FFMPEG_BIN","ffmpeg"))
        if not ffmpeg:
            self.store.update_project(pid,owner,status="assembly_pending",error="All scenes are ready; Simo's final video assembler is not available on this server yet.")
            return
        root=Path(self.config.storage_dir)/"long_video"/pid; root.mkdir(parents=True,exist_ok=True)
        listfile=root/"concat.txt"
        lines=[]
        for s in scenes:
            raw_path=str(s.get("local_media_path") or "").strip()
            if not raw_path:
                self.store.update_project(pid,owner,status="assembly_pending",error="A completed scene file is missing from Simo storage.")
                return
            # FFmpeg concat manifests are picky about Windows backslashes/drive paths.
            # Resolve each scene and write a forward-slash path (F:/...) so the
            # concat demuxer does not interpret backslashes as escape characters.
            normalized=Path(raw_path).resolve().as_posix().replace("'", "'\\''")
            lines.append(f"file '{normalized}'")
        listfile.write_text("\n".join(lines)+"\n",encoding="utf-8")
        final=root/"final.mp4"
        wants_audio=any(
            (sc.get("spec") or {}).get("audio")
            or (sc.get("spec") or {}).get("music")
            or (sc.get("spec") or {}).get("voiceover")
            for sc in scenes
        )
        cmd=[
            ffmpeg,"-y","-f","concat","-safe","0","-i",str(listfile.resolve()),
            "-fflags","+genpts",
            "-c:v","libx264","-preset","medium","-crf","19",
        ]
        if wants_audio:
            # Normalize scene-to-scene loudness after concatenation so music,
            # ambience, and narration do not jump noticeably at each join.
            cmd += ["-af","aresample=async=1:first_pts=0,loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-c:a","aac","-b:a","192k"]
        else:
            cmd += ["-an"]
        cmd += ["-movflags","+faststart",str(final.resolve())]

        p=subprocess.run(cmd,capture_output=True,text=True,timeout=max(180,int(len(scenes)*30)))
        if p.returncode!=0 or not final.exists():
            # Keep the already-paid scenes. Never regenerate because assembly failed.
            detail=" ".join((p.stderr or "").split())[-700:]
            error="All scenes are ready, but final assembly needs attention."
            if detail:
                error += " FFmpeg: " + detail
            self.store.update_project(pid,owner,status="assembly_pending",error=error)
            return
        # Final-delivery QA: never call the long video complete if the assembled
        # file is empty, lacks video, or drops requested audio.
        if final.stat().st_size <= 0:
            self.store.update_project(pid,owner,status="assembly_pending",error="Final assembly produced an empty file; the paid scenes remain safe for retry.")
            return

        ffprobe=shutil.which(os.getenv("SIMO_FFPROBE_BIN","ffprobe"))
        if ffprobe:
            try:
                probe=subprocess.run(
                    [ffprobe,"-v","error","-show_entries","stream=codec_type","-of","json",str(final.resolve())],
                    capture_output=True,text=True,timeout=30
                )
                pdata=json.loads(probe.stdout or "{}") if probe.returncode==0 else {}
                kinds={str(x.get("codec_type") or "") for x in (pdata.get("streams") or [])}
                if "video" not in kinds:
                    self.store.update_project(pid,owner,status="assembly_pending",error="Final assembly validation did not find a video track; the paid scenes remain safe for retry.")
                    return
                if wants_audio and "audio" not in kinds:
                    self.store.update_project(pid,owner,status="assembly_pending",error="Final assembly validation did not find the requested audio track; the paid scenes remain safe for retry.")
                    return
                dims=subprocess.run(
                    [ffprobe,"-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","csv=p=0:s=x",str(final.resolve())],
                    capture_output=True,text=True,timeout=30
                )
                raw=(dims.stdout or "").strip().lower()
                if "x" in raw:
                    try:
                        w,h=[int(x) for x in raw.split("x",1)]
                        requested=str((scenes[0].get("spec") or {}).get("output_resolution") or "1080p").lower()
                        if requested=="4k" and not (max(w,h)>=3840 or min(w,h)>=2160):
                            self.store.update_project(pid,owner,status="assembly_pending",error=f"4K was requested, but final validation found only {w}x{h}. Paid scenes remain safe for retry.")
                            return
                        if requested=="1080p" and not (max(w,h)>=1920 or min(w,h)>=1080):
                            self.store.update_project(pid,owner,status="assembly_pending",error=f"1080p was requested, but final validation found only {w}x{h}. Paid scenes remain safe for retry.")
                            return
                    except Exception:
                        pass
            except Exception:
                pass
        elif wants_audio and hasattr(self.short,"_mp4_has_audio_track"):
            if not self.short._mp4_has_audio_track(str(final)):
                self.store.update_project(pid,owner,status="assembly_pending",error="Final assembly validation did not find the requested audio track; the paid scenes remain safe for retry.")
                return

        self._consume_orchestration(pid,owner)
        self.store.update_project(pid,owner,status="succeeded",local_media_path=str(final),output_url="/api/long-video/media/"+pid,error="")

    def public(self,pid):return self.store.project_public(pid,self.owner())
