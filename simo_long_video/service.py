
import os, re, json, math, subprocess, shutil, urllib.request, tempfile, threading, time, secrets
from contextlib import contextmanager
import base64
import hashlib
from pathlib import Path
from simo_video.providers import RunwayRouterClient, ProviderError
from .local_score import create_score
from .finishing import pace_narration, brand_finale

class LongVideoService:
    def __init__(self, short_service, store, credits):
        self.short=short_service
        self.config=short_service.config
        self.store=store
        self.credits=credits
        self._workers=set()
        self._worker_lock=threading.Lock()

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

        # Brand/product technology commercials need feature-specific scenes rather
        # than the generic "same person" documentary storyboard.  Keep this
        # deterministic: the user can inspect it at NO provider cost.
        is_technology_promo = (
            bool(re.search(r"\b(simo|simonchat\.ai|ai assistant|artificial intelligence|ai technology)\b", lower))
            and bool(re.search(r"\b(commercial|advert|advertisement|promo|promotional|showcase|introduc|capabilit|feature|technology|website|creative)\w*\b", lower))
        )
        if is_technology_promo:
            entrepreneur_story = bool(re.search(r"\b(entrepreneur|founder|creative journey|one complete story|same entrepreneur)\b", lower))
            brand = "Simo" if re.search(r"\b(simo|simonchat\.ai)\b", lower) else "the featured AI service"
            destination = "simonchat.ai" if "simonchat.ai" in lower else "the requested website or call to action"
            if count <= 3:
                beats = [
                    ("Brand introduction", f"premium cinematic opening introducing {brand} as a creative AI assistant; use the user's requested branding and art direction without inventing a logo"),
                    ("Creative capabilities", "show recognizable demonstrations of the specific capabilities requested: professional website building, AI image/design creation, business ideas, writing/books, and cinematic video; synchronize these visual examples with the associated voiceover phrases; use cohesive screen and scene transitions"),
                    ("Branded finale", f"resolve with a powerful, elegant brand moment and the requested call to action ({destination}); if exact supplied brand artwork cannot be reproduced, leave a clean area for the authentic logo to be composited later"),
                ]
            elif entrepreneur_story:
                beats = [
                    ("The idea", "same entrepreneur at a desk sees one new business idea come to life; blue cinematic light, intimate moment"),
                    ("Website", "same entrepreneur types the idea into Simo, then sees the first beautiful website for that same business appear"),
                    ("Branded imagery", "same entrepreneur makes product photos and branding for that very same business; workspace unchanged"),
                    ("Writing and book", "same entrepreneur develops the business story, writes a book and sees its finished cover on the desk"),
                    ("Cinematic video", "same entrepreneur transforms those existing business designs into a cinematic launch video; visible growing excitement"),
                    ("Brand finale", f"same workspace and creator; conclude the project with a polished launch moment, clean area for authentic {brand} logo and {destination}"),
                ]
            else:
                beats = [
                    ("Brand introduction", f"cinematic reveal of {brand} and its creative AI promise, with faithful user-supplied visual identity"),
                    ("Website creation", "demonstrate turning a natural-language request into a polished professional website"),
                    ("Design and imagery", "demonstrate creating and editing professional imagery from natural-language instructions"),
                    ("Business and writing", "demonstrate business ideation and book or written-content creation as requested"),
                    ("Cinematic video", "demonstrate visual storytelling, video, and voiceover/music creation as requested"),
                    ("Branded finale", f"end on a memorable clean branded composition and the requested call to action ({destination}); do not fabricate an exact logo"),
                ]
        elif re.search(r"\b(car|sedan|vehicle|truck|suv|motorcycle|road|driving|drive)\b", lower):
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

        # Map the *whole* story to the requested length. Never wrap around to
        # the opening after a branded closing shot. Expand internal beats with
        # distinct continuations while reserving the finale for the final scene.
        if count <= 0:
            return []
        if count == 1:
            return [beats[-1]]
        if count == 2:
            return [beats[0], beats[-1]]
        if count <= len(beats):
            return [beats[round(i * (len(beats)-1) / (count-1))] for i in range(count)]

        # Keep opening and closing exactly once, assigning the extra scene time
        # to the middle of the story (the actual customer demonstration).
        middle = beats[1:-1]
        slots = count - 2
        out = [beats[0]]
        for i in range(slots):
            j = (i * len(middle)) // slots
            beat = middle[j]
            repeated_before = sum(1 for x in out if x[0] == beat[0] or x[0].startswith(beat[0] + " — "))
            if repeated_before:
                out.append((
                    beat[0] + " — continuation " + str(repeated_before + 1),
                    beat[1] + "; show the next meaningful development or result, "
                    "building on the previous shot with a new angle, not restarting the story"
                ))
            else:
                out.append(beat)
        out.append(beats[-1])
        return out

    def _continuity_anchor(self, prompt):
        """Extract the story's persistent subject before scene-specific instructions.

        This intentionally uses no external API and introduces no new provider cost.
        """
        raw=" ".join(str(prompt or "").split())
        low=raw.lower()
        entrepreneur=bool(re.search(r"\b(entrepreneur|founder|creator|artist|designer|small business owner)\b",low))
        if entrepreneur:
            return "Same entrepreneur, outfit, workspace and evolving creative project throughout"
        if re.search(r"\b(same|consistent|single|one)\s+(?:person|character|protagonist|actor|woman|man)\b",low):
            return "Same protagonist, face, clothing and location throughout"
        if re.search(r"\b(car|vehicle|motorcycle|truck|suv)\b",low):
            return "Same vehicle, color, environment and travel direction throughout"
        if re.search(r"\b(product|watch|bottle|jewelry|shoe)\b",low):
            return "Same exact product, materials and setting throughout"
        return "Preserve the same main subject, location, visual style and story timeline"

    def _scene_prompt(self, base_prompt, index, count, beat=None):
        """Prioritize a persistent story anchor and a clear evolving scene beat.

        Router compacts prompts to 360 characters. Put all essential direction
        BEFORE the context tail, so the shared identity survives truncation.
        """
        beat_title, beat_instruction=beat or ("Scene", "advance the story")
        instruction=" ".join(str(beat_instruction or "").split())
        anchor=self._story_identity_brief(base_prompt)
        # Start with the actual subject rather than a long 'Scene 1/6' prefix.
        intro=f"{anchor}. "
        # The video provider may not support reference-image/last-frame chaining.
        # This wording improves the prompt but does not guarantee visual identity.
        beat=f"{beat_title}: {instruction}. "
        budget=360
        if len(intro)+len(beat)>budget:
            beat=beat[:max(0,budget-len(intro)-2)].rstrip(' ,;:.')+'. '
        carry=("Opening: establish subject and world. " if index==0 else
               "Finale: resolve the SAME story, no new people. " if index==count-1 else
               "Continue the prior action; do not start a new story. ")
        prefix=intro+carry
        if len(prefix)+len(beat)>budget:
            beat=beat[:max(0,budget-len(prefix)-2)].rstrip(' ,;:.')+'. '
        return (prefix+beat).strip()[:budget]

    def _story_identity_brief(self, prompt):
        """Carry the same central story and branding into each short scene.

        This is prompt guidance, not a provider visual-reference mechanism.
        """
        raw=" ".join(str(prompt or "").split())
        lower=raw.lower()
        if "simo" in lower and ("commercial" in lower or "entrepreneur" in lower):
            return "One entrepreneur grows one business using Simo; same desk, clothes, face and project; no religious or unrelated imagery"
        # Keep an explicit subject from the customer's own story rather than
        # substituting a generic unrelated creative template.
        subject=re.split(r"(?<=[.!?])\s+",raw, maxsplit=1)[0][:115].strip()
        return subject or "One connected story with the same primary subject"

    def _validate_storyboard(self, plan):
        """Fail the free production plan if a scene loses its story instructions."""
        scenes=plan.get("scenes") or []
        if not scenes:
            raise RuntimeError("Simo could not prepare story scenes; no video was billed.")
        if sum(int(s.get("duration_seconds") or 0) for s in scenes)!=int(plan.get("total_seconds") or 0):
            raise RuntimeError("Story scene durations do not match requested length; no video was billed.")
        for idx,scene in enumerate(scenes):
            spec=scene.get("spec") or {}
            prompt=str(spec.get("prompt") or "")
            if not prompt or len(prompt)>360:
                raise RuntimeError(f"Scene {idx+1} has an invalid production prompt; no video was billed.")
            if idx==len(scenes)-1 and "finale" not in prompt.lower() and "closing" not in prompt.lower():
                raise RuntimeError("Simo's story plan lost its ending; no video was billed.")
        return plan

    def _validate_scene_media_before_assembly(self, scenes):
        """Verify the actual paid scene files before allowing a successful assembly.

        A provider can return a technically valid MP4 shorter than its paid
        duration; do not silently concatenate that into an incomplete film.
        """
        for i,scene in enumerate(scenes):
            path=Path(str(scene.get("local_media_path") or ""))
            if not path.is_file() or path.stat().st_size==0:
                return f"Scene {i+1} media is missing; paid scenes are preserved."
            expected=float((scene.get("spec") or {}).get("duration_seconds") or scene.get("duration_seconds") or 0)
            if expected<=0:
                return f"Scene {i+1} duration is invalid; paid scenes are preserved."
            try:
                actual=self._media_duration(path)
            except Exception:
                return f"Scene {i+1} duration could not be verified; paid scenes are preserved."
            if abs(actual-expected)>0.75:
                return f"Scene {i+1} returned {actual:.1f}s instead of {expected:.1f}s; paid scenes are preserved."
        return None

    def _split_voiceover(self,text,count):
        """Split the narration at sentence boundaries, not arbitrary word offsets.

        Each scene gets a complete spoken thought whenever the supplied script
        has enough sentences. This reduces mid-sentence cuts from per-clip TTS.
        Separate provider clips still cannot guarantee a truly continuous voice.
        """
        text=" ".join(str(text or "").split()).strip()
        if count <= 0:
            return []
        if not text:
            return [""]*count
        sentences=re.split(r"(?<=[.!?])\s+(?=[\"'“‘A-Za-z0-9])",text)
        sentences=[s.strip() for s in sentences if s.strip()]
        if len(sentences) < count:
            # Prefer natural commas/semicolons to raw word-boundary cuts.
            parts=[]
            for s in sentences:
                parts.extend(p.strip() for p in re.split(r"(?<=[,;:])\s+",s) if p.strip())
            if len(parts) >= count:
                sentences=parts
        # When the user has fewer spoken phrases than scenes, leave remaining
        # scenes without a narration chunk. Never replay the full script there.
        if len(sentences) < count:
            return sentences + [""]*(count-len(sentences))
        out=[]
        offset=0
        for i in range(count):
            slots=count-i
            if slots==1:
                out.append(" ".join(sentences[offset:]))
                break
            remaining=sentences[offset:]
            target=sum(len(s.split()) for s in remaining)/slots
            maximum=len(remaining)-(slots-1)
            running=0
            best=1
            best_error=float("inf")
            for n in range(1,maximum+1):
                running+=len(remaining[n-1].split())
                error=abs(running-target)
                if error < best_error:
                    best_error=error
                    best=n
            out.append(" ".join(remaining[:best]))
            offset+=best
        return out

    def _audio_client(self):
        return RunwayRouterClient(self.config.runway_api_key,
                                 self.config.runway_audio_config_id,
                                 self.config.runway_api_base)

    def _master_specs(self,base,total):
        # Master audio is always separate from independently generated scene sound.
        items={}
        if base.get("voiceover"):
            script=str(base.get("voiceover_text") or "").strip()
            if not script:
                if not callable(getattr(self,"script_writer",None)):
                    raise ValueError("Simo's automatic script writer is unavailable; no generation billed.")
                if total>1800:
                    raise ValueError("Automatic narration currently supports up to 30 minutes; longer films can use a supplied script. No generation billed.")
                # Length-only price probe. This is replaced before paid speech.
                # No paid AI planning is performed by the free quote.
                script=" ".join(["narration"]*max(1,int((total-3)*2.5)))
                auto=True
            else:
                auto=False
            # Free preflight catches plainly under/over-length scripts before
            # paying for speech. Actual audio timing is checked again afterward.
            words=len(re.findall(r"\b[\w’'-]+\b",script))
            speaking_seconds=max(1,int(total)-3)
            minimum=max(1,int(speaking_seconds*1.9))
            maximum=max(minimum,int(speaking_seconds*3.1))
            if not minimum<=words<=maximum:
                raise ValueError(
                    f"This {total}s video needs approximately {minimum}–{maximum} narration words "
                    f"for continuous natural speech; the script has {words}. "
                    "No media generation was billed.")
            items["voice"]={"type":"speech","promptText":script}
            if auto:items["voice"]["_simo_auto_script"]=True
        # Do not ask Seed Audio to compose music: it rejects that input.
        # A Simo-owned evolving underscore is prepared locally during production.
        return items

    def _audio_request(self,payload,live=False):
        provider_input={k:v for k,v in payload.items() if not k.startswith("_simo_")}
        body={"configId":self._audio_client().config_id,"input":provider_input}
        if not live: body["dryRun"]=True
        return self._audio_client()._request_json("POST","/v1/generate/audio",body,timeout=45)

    def _speech_parts(self, spec):
        text=str(spec.get("promptText") or "").strip()
        if spec.get("type")!="speech":return [spec]
        # Independent speech service limits must not become scene boundaries.
        # Preserve every word; these parts are joined into one master recording.
        parts=[]
        while text:
            if len(text)<=1800:
                part=text;text=""
            else:
                head=text[:1800]
                ends=[m.end() for m in re.finditer(r"[.!?](?:[\"’”])?\s+",head)]
                cut=ends[-1] if ends and ends[-1]>=900 else head.rfind(" ")
                if cut<=0:raise ValueError("Narration contains a word longer than the speech input limit.")
                part=text[:cut].strip();text=text[cut:].strip()
            parts.append({**spec,"promptText":part})
        return parts

    def _audio_part_quotes(self,items):
        quoted={}
        for label,spec in items.items():
            try:
                response=self._audio_request(spec)
            except Exception as exc:
                raise RuntimeError("Simo could not verify complete " + label +
                  " generation with the saved Runway audio router. No provider media was generated. " + str(exc)) from exc
            routing=response.get("routing") or {}
            cost=routing.get("estimatedCost") or {}
            provider=int(cost.get("credits") or routing.get("estimatedCredits") or 0)
            if provider<=0:
                raise RuntimeError("The audio router did not return a valid cost for " + label + ". No production was started.")
            # Independent ceiling for every audio task, plus a combined ceiling below.
            cap=int(os.getenv("SIMO_LONG_VIDEO_AUDIO_MAX_PROVIDER_CREDITS_PER_TASK","30"))
            if provider>cap:
                raise RuntimeError("Master " + label + " exceeds Simo's protected audio cost limit.")
            revenue=self.short._simo_credit_quote_from_provider_credits(provider,native_audio=True)
            quoted[label]={"provider_credits":provider,"simo_credits":revenue}
        if sum(x["provider_credits"] for x in quoted.values())>int(os.getenv("SIMO_LONG_VIDEO_AUDIO_MAX_TOTAL_PROVIDER_CREDITS","60")):
            raise RuntimeError("Master audio exceeds Simo's total provider-cost limit.")
        return quoted

    def _audio_quotes(self,items):
        quoted={}
        for label,spec in items.items():
            parts=self._speech_parts(spec)
            named={str(i):part for i,part in enumerate(parts)}
            quotes=self._audio_part_quotes(named)
            quoted[label]={"provider_credits":sum(x["provider_credits"] for x in quotes.values()),
                           "simo_credits":sum(x["simo_credits"] for x in quotes.values())}
        cap=int(os.getenv("SIMO_LONG_VIDEO_AUDIO_MAX_TOTAL_PROVIDER_CREDITS","60"))
        if sum(x["provider_credits"] for x in quoted.values())>cap:
            raise RuntimeError("Complete narration exceeds the configured protected audio budget; no speech started.")
        return quoted

    def _audio_state_path(self,pid):
        root=Path(self.config.storage_dir)/"long_video"/str(pid)
        root.mkdir(parents=True,exist_ok=True)
        return root/"master_audio_state.json"

    def _write_audio_state(self,pid,state):
        target=self._audio_state_path(pid)
        temp=target.with_suffix(".tmp")
        temp.write_text(json.dumps(state,indent=2),encoding="utf-8")
        os.replace(temp,target)

    def _read_audio_state(self,pid):
        path=self._audio_state_path(pid)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def _media_duration(self,path):
        ffprobe=shutil.which(os.getenv("SIMO_FFPROBE_BIN","ffprobe"))
        if not ffprobe: raise RuntimeError("Simo requires ffprobe to validate the complete soundtrack.")
        r=subprocess.run([ffprobe,"-v","error","-show_entries","format=duration", "-of","default=noprint_wrappers=1:nokey=1",str(path)],capture_output=True,text=True,timeout=30)
        if r.returncode: raise RuntimeError("Could not validate master audio duration.")
        return float(r.stdout.strip())

    def _save_audio(self,pid,label,url):
        if not str(url).startswith("https://"):
            raise RuntimeError("Runway did not provide a secure master audio output for " + label)
        root=self._audio_state_path(pid).parent
        target=root/("master_"+label+".audio")
        # Restricted fetch size; do not accept unbounded provider downloads.
        maximum=int(os.getenv("SIMO_LONG_VIDEO_MAX_MASTER_AUDIO_BYTES","80000000"))
        request=urllib.request.Request(url,headers={"User-Agent":"SimoLongVideo/1.0"})
        size=0
        with urllib.request.urlopen(request,timeout=120) as resp,open(target.with_suffix(".part"),"wb") as out:
            while True:
                b=resp.read(1048576)
                if not b:break
                size+=len(b)
                if size>maximum: raise RuntimeError("Master audio exceeded Simo's storage limit.")
                out.write(b)
        if size==0:raise RuntimeError("Runway returned empty master audio.")
        os.replace(target.with_suffix(".part"),target)
        return str(target)

    def _extend_music(self,pid,path,total):
        """Build a continuous-duration bed from a provider-supported <=30s clip.

        Overlap equal copies with smooth crossfades, rather than making a hard
        splice. Finish this BEFORE any paid video scene starts. This does not
        claim the underlying generated composition has unique 60s progression.
        """
        duration=self._media_duration(path)
        if duration>=total-0.5:
            return path
        if duration<4.0:
            raise RuntimeError("Music provider returned too little audio for safe crossfades.")
        overlap=min(2.5,max(0.3,duration/8.0))
        effective=duration-overlap
        if effective<=1.0:
            raise RuntimeError("Music clip cannot be extended safely.")
        import math
        copies=max(2,int(math.ceil((total-overlap)/effective)))
        # Keep memory/processing bounded even if the provider returned a short clip.
        if copies>60:
            raise RuntimeError("Music requires too many repeated segments; production stopped before video generation.")
        root=self._audio_state_path(pid).parent
        result=root/"master_music_continuous.wav"
        ffmpeg=shutil.which(os.getenv("SIMO_FFMPEG_BIN","ffmpeg"))
        if not ffmpeg:
            raise RuntimeError("FFmpeg is required to prepare seamless-duration music.")
        cmd=[ffmpeg,"-y","-v","error"]
        for _ in range(copies): cmd.extend(["-i",str(path)])
        filters=[]
        for index in range(copies):
            filters.append(f"[{index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[m{index}]")
        prior="m0"
        for index in range(1,copies):
            next_label=f"xf{index}"
            filters.append(f"[{prior}][m{index}]acrossfade=d={overlap:.3f}:c1=tri:c2=tri[{next_label}]")
            prior=next_label
        filters.append(f"[{prior}]atrim=duration={total},asetpts=N/SR/TB[out]")
        cmd.extend(["-filter_complex",";".join(filters),"-map","[out]","-c:a","pcm_s16le",str(result)])
        finished=subprocess.run(cmd,capture_output=True,text=True,timeout=max(90,total*3))
        if finished.returncode or not result.exists():
            raise RuntimeError("Music preparation failed before paid video scenes started: " + " ".join((finished.stderr or "").split())[-250:])
        actual=self._media_duration(result)
        if actual<total-0.5:
            raise RuntimeError("Prepared soundtrack is shorter than the requested film.")
        return str(result)

    def _begin_master_audio(self,pid,plan):
        specs=plan.get("master_audio_specs") or {}
        if not specs and not plan.get("local_music") and not plan.get("needs_story"):return
        state={"mode":"master","status":"creating","total_seconds":int(plan["total_seconds"]),"items":{}}
        state["planner_reservation"]=plan.get("planner_reservation")
        self._write_audio_state(pid,state)
        if plan.get("needs_story"):
            seconds=max(1,int(plan["total_seconds"])-3)
            minimum=int(seconds*1.9);maximum=int(seconds*3.1)
            state["planner_status"]="attempted"
            self._write_audio_state(pid,state)
            wants_voice=bool(plan["delivery"].get("voiceover"))
            supplied=plan["delivery"].get("voiceover_text") or None
            self.credits.mark_started(plan.get("planner_reservation"))
            result=self.script_writer(plan["prompt"],plan["total_seconds"],minimum,maximum,
                plan["scene_count"],supplied_script=supplied,narration_required=wants_voice)
            if not isinstance(result,dict):raise RuntimeError("Invalid complete story plan.")
            prompts=result.get("scene_prompts")
            if not isinstance(prompts,list) or len(prompts)!=plan["scene_count"]:
                raise RuntimeError("Story planner returned an incomplete scene count; video scenes have not started.")
            approved=[]
            for scene,prompt in zip(self.store.scenes_private(pid,self.owner()),prompts):
                if not isinstance(prompt,str) or not prompt.strip() or len(prompt)>360:
                    raise RuntimeError("Invalid story direction; video scenes have not started.")
                continuity = result.get("scene_continuity") or []
                index = len(approved)
                chain = bool(index and index < len(continuity) and continuity[index])
                new_spec={**scene["spec"],"prompt":prompt.strip(),"_simo_chain_previous":chain}
                q=self._protected_scene_quote(new_spec)
                if q["estimated_simo_credits"]>scene["required_credits"]:
                    raise RuntimeError("Story-specific scene cost exceeds its reservation; video scenes have not started.")
                approved.append((scene,new_spec))
            for scene,new_spec in approved:
                self.store.update_scene(scene["id"],self.owner(),prompt=new_spec["prompt"],spec_json=json.dumps(new_spec))
            script=str(result.get("narration") or "").strip()
            if wants_voice:
                if supplied and script!=' '.join(supplied.split()):
                    raise RuntimeError("The story planner altered your script; speech has not started.")
                specs=self._master_specs({"voiceover":True,"voiceover_text":script},plan["total_seconds"])
            state["script"]=script;state["scene_narration"]=result.get("scene_narration",[])
            state["planner_status"]="completed"
            self._write_audio_state(pid,state)
        if plan.get("local_music"):
            path=self._audio_state_path(pid).parent/"master_music_simo.wav"
            create_score(path,plan["total_seconds"],plan.get("delivery",{}).get("music_style",""))
            state["items"]["music"]={"status":"ready","file":str(path),"duration":self._media_duration(path)}
            self._write_audio_state(pid,state)
        for label,spec in specs.items():
            # Re-check the SAME request immediately before paid generation.
            fresh=self._audio_quotes({label:spec})[label]
            allowance=plan["master_audio_quotes"][label]
            if fresh["simo_credits"]>allowance["simo_credits"]:
                raise RuntimeError("Provider audio price changed before generation; production stopped before additional spend.")
            parts=self._speech_parts(spec)
            for index,part in enumerate(parts):
                key=label if len(parts)==1 else f"{label}_{index:04d}"
                # Persist an attempt before the POST. A missing task ID is an
                # ambiguous paid request, not permission to create it again.
                state["items"][key]={"status":"submission_pending","id":"","file":""}
                self._write_audio_state(pid,state)
                project=self.store.project_private(pid,self.owner())
                self.credits.mark_started((project or {}).get("orchestration_reservation"))
                response=self._audio_request(part,live=True)
                task=str(response.get("id") or response.get("taskId") or response.get("task_id") or "")
                if not task:raise RuntimeError("The speech service did not return a task ID; production is paused without retrying the paid request.")
                state["items"][key]={"id":task,"status":"creating","file":""}
                self._write_audio_state(pid,state)
        return state

    def _advance_master_audio(self,pid,owner):
        state=self._read_audio_state(pid)
        if not state:return True
        if state.get("status") in {"ready","visuals_only"}:return True
        if not state.get("items") and state.get("planner_status")=="completed":
            state["status"]="visuals_only"
            self._write_audio_state(pid,state)
            return True
        for label,item in state["items"].items():
            if item["status"]=="ready":continue
            if not item.get("id"):
                raise ProviderError("A speech submission has no saved task ID. Simo will not resubmit it automatically.")
            response=self._audio_client().poll(item["id"])
            if response.status in {"failed","canceled"}:
                raise RuntimeError("Master " + label + " audio generation failed: " + str(response.error))
            if response.status!="succeeded":return False
            path=self._save_audio(pid,label,response.output_url)
            duration=self._media_duration(path)
            # Narration can finish before final logo hold; NEVER truncate it.
            if label=="voice":
                path=pace_narration(path,self._audio_state_path(pid).parent/"master_voice_paced.wav",
                                    duration,state["total_seconds"])
                duration=self._media_duration(path)
            if label=="music" and duration<state["total_seconds"]-0.5:
                path=self._extend_music(pid,path,int(state["total_seconds"]))
                duration=self._media_duration(path)
            item.update(status="ready",file=path,duration=duration)
            self._write_audio_state(pid,state)
        voice_parts=[item for key,item in sorted(state["items"].items()) if key.startswith("voice_")]
        if voice_parts:
            from .finishing import join_narration
            root=self._audio_state_path(pid).parent
            master=join_narration([x["file"] for x in voice_parts],root/"master_voice_joined.wav")
            master=pace_narration(master,root/"master_voice_paced.wav",
                                 self._media_duration(master),state["total_seconds"])
            state["items"]["voice"]={"status":"ready","file":str(master),"duration":self._media_duration(master)}
        state["status"]="ready"
        self._write_audio_state(pid,state)
        return True

    def _fail_unstarted(self,pid,owner,error):
        for scene in self.store.scenes_private(pid,owner):
            if scene["status"]=="queued":
                self._release_once(scene,"long_video_master_audio_failed_before_scene")
                self.store.update_scene(scene["id"],owner,status="canceled",error="Audio preparation failed before video generation.")
        self._refund_failed_delivery(pid,owner,"master_audio_delivery_failed")
        self.store.update_project(pid,owner,status="failed",error=str(error))

    def plan(self,data):
        # Existing app.py integrations may assign their older narration function
        # after registration. That function has no bounded quote or scene-plan
        # contract. Restore the configured author before quoting or reserving.
        writer=getattr(self,"script_writer",None)
        if callable(writer) and not callable(getattr(writer,"quote_credits",None)):
            from .story_writer import configured_writer
            self.script_writer=configured_writer()
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
        # Named music/narration fields are direct requests, even when the
        # main description omits those words. Align pricing with delivery.
        if str(inferred.get("music_style") or "").strip() and not inferred.get("music_user_override"):
            inferred["music"]=True
        if str(inferred.get("voiceover_text") or "").strip() and not inferred.get("voiceover_user_override"):
            inferred["voiceover"]=True

        if inferred.get("voiceover") and not str(inferred.get("voiceover_text") or "").strip():
            voice_patterns=[
                r'\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s*:?\s*["“]([^"”]{1,800})["”]',
                r"\b(?:voiceover|voice over|narration|narrator)\s+(?:that\s+)?(?:says?|saying|reads?|reading)\s*:?\s*['‘]([^'’]{1,800})['’]",
            ]
            for pattern in voice_patterns:
                vm=re.search(pattern,prompt,flags=re.I)
                if vm:
                    inferred["voiceover_text"]=" ".join(vm.group(1).split())
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
        # Explicit negative requests and deliberate checkbox overrides win over
        # keyword presence ("no narration" must never request narration).
        if re.search(r"\b(?:no|without|avoid)\s+(?:any\s+)?(?:voiceover|voice over|narration|narrator|speech|spoken words)\b|\bdo not narrate\b",lower):
            base["voiceover"]=False
        if re.search(r"\b(?:music|instrumental)\s+only\b",lower):
            base["voiceover"]=False;base["audio"]=False;base["music"]=True
        if re.search(r"\b(?:no|without|avoid)\s+(?:any\s+)?(?:music|soundtrack|score)\b",lower):
            base["music"]=False
        if re.search(r"\b(?:silent video|completely silent|no sound|without sound)\b",lower):
            base["audio"]=False;base["music"]=False;base["voiceover"]=False
        for flag in ("audio","music","voiceover"):
            if inferred.get(flag+"_user_override"):
                base[flag]=bool(inferred.get(flag))
        # The short-clip sanitizer limits speech text. A film needs its complete
        # recording script, not a truncated short-scene excerpt.
        full_script=" ".join(str(inferred.get("voiceover_text") or "").split())
        if len(full_script)>100000:
            raise ValueError("Narration script exceeds the supported input size; no generation billed.")
        if full_script:
            base["voiceover_text"]=full_script
        video_base={**base,"voiceover":False,"music":False,"audio":bool(base.get("audio")),"voiceover_text":"","music_style":""}

        # At 1080p the selected Veo 3.1 Fast route accepts eight-second
        # clips, NOT six-second clips. Its dry-run historically accepted 6s,
        # then the paid endpoint rejected it. Always price and submit the
        # actual 8s input, and trim the *assembled* film to the user timeline.
        # This may require one paid clip with a partial final timeline segment.
        scene_len=None
        last_error=None
        candidates = [8] if output_resolution == "1080p" else [10,8,6,5,4]
        for candidate in candidates:
            try:
                proposed_count=int(math.ceil(total/candidate))
                if output_resolution == "1080p":
                    # Only the *display/assembly* timing is shortened on the
                    # last scene. All paid requests remain exactly 8 seconds.
                    proposed_durations=[candidate] * proposed_count
                else:
                    qsec,rem=divmod(total,proposed_count)
                    proposed_durations=[qsec+(1 if i<rem else 0) for i in range(proposed_count)]
                    if min(proposed_durations)<4 or max(proposed_durations)>candidate:
                        raise RuntimeError("This split cannot preserve the requested duration.")
                probe_beat=self._storyboard_template(prompt,proposed_count)[0]
                probe_prompt=self._scene_prompt(prompt,0,proposed_count,probe_beat)
                # Router models can support discrete lengths: an accepted 8s
                # request does not imply an accepted 7s request. Validate the
                # ACTUAL balanced schedule before selecting this candidate.
                for duration in dict.fromkeys(proposed_durations):
                    probe={**video_base,"duration_seconds":duration,"prompt":probe_prompt}
                    self._protected_scene_quote(probe)
                    if proposed_count>1:
                        continuation={**video_base,"duration_seconds":duration,
                            "prompt":probe_prompt,"_simo_chain_previous":True}
                        self._protected_scene_quote(continuation)
                scene_len=candidate
                count=proposed_count
                durations=proposed_durations
                break
            except Exception as exc:
                last_error=exc
        if scene_len is None:
            raise RuntimeError(
                "Simo could not find a protected scene size for this output quality. "
                "No provider generation was billed. " + (str(last_error) if last_error else "")
            )

        if max(durations)>scene_len or min(durations)<4:
            raise RuntimeError("Simo could not safely segment this duration. No provider generation was billed.")

        master_specs=self._master_specs(base,total)
        if (master_specs or base.get("music")) and (not shutil.which(os.getenv("SIMO_FFMPEG_BIN","ffmpeg")) or not shutil.which(os.getenv("SIMO_FFPROBE_BIN","ffprobe"))):
            raise RuntimeError("Simo needs FFmpeg and FFprobe for continuous audio; no generation was billed.")
        master_quotes=self._audio_quotes(master_specs)
        # Native clip audio is deliberately turned off: narration and music
        # are generated ONCE and mixed under the entire assembled film.
        video_base={**base,"voiceover":False,"music":False,"audio":bool(base.get("audio")),"voiceover_text":"","music_style":""}
        storyboard=self._storyboard_template(prompt,count)
        scene_specs=[{**video_base,"duration_seconds":dur,
                       "_simo_brand_finale":i==count-1 and bool(re.search(r"\bsimo\b",prompt,re.I)) and bool(re.search(r"\b(logo|branding|commercial|demo|demonstration|capabilities)\b",prompt,re.I)),
                       "_simo_chain_previous":i>0,
                       "prompt":self._scene_prompt(prompt,i,count,storyboard[i])}
                      for i,dur in enumerate(durations)]
        # The free quote uses one representative per input shape, keeping a
        # 20-minute plan out of HTTP timeout territory. The worker checks EVERY
        # actual story-directed scene again before the first paid video call.
        quote_cache={};scene_quotes=[]
        for sp in scene_specs:
            shape=(sp["duration_seconds"],sp.get("resolution"),sp.get("aspect_ratio"),
                   bool(sp.get("audio")),bool(sp.get("_simo_chain_previous")),bool(sp.get("_simo_brand_finale")))
            if shape not in quote_cache:
                quote=self._protected_scene_quote(sp)
                locked={k:sp[k] for k in ("_simo_approved_router","_simo_reference_inherit_aspect") if k in sp}
                quote_cache[shape]=(quote,locked)
            quote,locked=quote_cache[shape]
            sp.update(locked);scene_quotes.append(dict(quote))
        scene_credits=sum(int(q["estimated_simo_credits"]) for q in scene_quotes)
        provider_credits=sum(int(q["estimated_provider_credits"]) for q in scene_quotes)
        # Conservative orchestration allowance for CPU, storage and audio mastering.
        local_music_credits=12 if base.get("music") else 0
        needs_story=total<=1800 and callable(getattr(self,"script_writer",None))
        if not needs_story and total<=1800:
            raise ValueError("Simo's story writer is not configured on this server; no paid video started.")
        planner_credits=self.script_writer.quote_credits(self.config) if needs_story else 0
        audio_retail=sum(v["simo_credits"] for v in master_quotes.values())+local_music_credits+planner_credits
        audio_provider=sum(v["provider_credits"] for v in master_quotes.values())
        markup_env="SIMO_LONG_VIDEO_4K_ORCHESTRATION_MARKUP" if output_resolution=="4k" else "SIMO_LONG_VIDEO_ORCHESTRATION_MARKUP"
        markup_default="0.15" if output_resolution=="4k" else "0.10"
        orchestration=max(5,int(math.ceil(scene_credits*float(os.getenv(markup_env,markup_default) or markup_default))))+audio_retail
        total_simo=scene_credits+orchestration
        provider_credits+=audio_provider

        scenes=[]
        for i,dur in enumerate(durations):
            beat=storyboard[i]
            sp=scene_specs[i]
            # Present an exact-length film, while the provider sees its actual
            # 8s billed clip. In particular 60s => seven 8s + a final 4s
            # visual segment cropped from the eighth 8s paid clip.
            shown_duration = min(dur, max(0,total - sum(durations[:i])))
            scenes.append({
                "scene_index":i,"duration_seconds":shown_duration,
                "summary":f"Scene {i+1}: {beat[0]}",
                "description":beat[1],
                "required_credits":int(scene_quotes[i]["estimated_simo_credits"]),
                "provider_estimate_credits":int(scene_quotes[i]["estimated_provider_credits"]),
                "spec":sp
            })

        return self._validate_storyboard({
            "prompt":prompt,"total_seconds":total,"scene_seconds":scene_len,"scene_count":count,
            "output_resolution":output_resolution,
            "scene_credits":scene_credits,"orchestration_credits":orchestration,
            "required_credits":total_simo,"provider_estimate_credits":provider_credits,
            "master_audio_specs":master_specs,"master_audio_quotes":master_quotes,"audio_simo_credits":audio_retail,
            "local_music":bool(base.get("music")),"planner_credits":planner_credits,"needs_story":needs_story,
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
        })

    def start(self,data):
        owner=self.owner()
        fingerprint=hashlib.sha256(json.dumps(data,sort_keys=True,default=str).encode()).hexdigest()
        gate="start_"+hashlib.sha256(owner.encode()).hexdigest()
        with self._production_lease(gate) as acquired:
            if not acquired:
                raise RuntimeError("Simo is already processing your Create request. No second production was started.")
            for existing in self.store.list_projects(owner,100):
                if existing["status"] in {"succeeded","failed","canceled"}:continue
                path=self._audio_state_path(existing["id"]).parent/"production_plan.json"
                if path.exists():
                    recorded=json.loads(path.read_text(encoding="utf-8"))
                    if recorded.get("_request_fingerprint")==fingerprint:
                        return self.store.project_public(existing["id"],owner)
                # Reconcile definitively stopped legacy attempts before gating.
                scenes=self.store.scenes_private(existing["id"],owner)
                if scenes and any(x["status"] in {"failed","canceled"} for x in scenes) and not any(x.get("provider_job_id") and x["status"] in {"creating","processing","storage_pending"} for x in scenes):
                    self.store.update_project(existing["id"],owner,status="failed",error="This older production stopped after a scene failure.")
                    continue
                raise RuntimeError("An existing Simo video is still in progress. Open it in the Video Library before starting another; no new credits were reserved.")
            return self._start_new(data,fingerprint)

    def _start_new(self,data,fingerprint):
        # Fail closed: a missing credit bridge must NEVER become a mock paid job.
        # CreditHooks.reserve() intentionally permits mocks for standalone tests,
        # but that behavior cannot be allowed on the customer-facing live route.
        if not getattr(self.credits, "connected", False):
            raise RuntimeError("Simo Profit Shield is not connected. No paid generation started.")
        if not (self.config.enabled and not self.config.mock_mode
                and self.config.provider_enabled and not self.config.provider_kill_switch):
            raise RuntimeError("Protected live video generation is not enabled. No paid generation started.")
        plan=self.plan(data);plan["_request_fingerprint"]=fingerprint; owner=self.owner()
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
        planner_reservation=None
        try:
            for scene in plan["scenes"]:
                reservations.append(self.credits.reserve(scene["required_credits"],action="long_video_scene_4k" if plan.get("output_resolution")=="4k" else "long_video_scene"))
            orchestration_reservation=self.credits.reserve(
                plan["orchestration_credits"]-plan.get("planner_credits",0),action="long_video_orchestration"
            )
            if plan.get("planner_credits"):
                planner_reservation=self.credits.reserve(plan["planner_credits"],action="long_video_script")
        except Exception:
            for r in reservations:self.credits.release(r,"long_video_preflight_failed")
            if planner_reservation:self.credits.release(planner_reservation,"long_video_preflight_failed")
            if orchestration_reservation:
                self.credits.release(orchestration_reservation,"long_video_preflight_failed")
            raise

        pid=None
        try:
            pid=self.store.create_project(
                owner,title,plan["prompt"],plan["total_seconds"],plan["scene_seconds"],
                plan["scene_count"],plan["required_credits"],orchestration_reservation
            )
            for scene,res in zip(plan["scenes"],reservations):
                self.store.add_scene(
                    pid,owner,scene["scene_index"],scene["spec"]["prompt"],
                    scene["spec"],scene["required_credits"],res
                )
            self.store.update_project(pid,owner,status="creating")
        except Exception:
            # No provider call has started yet. Release every reservation if
            # persistence/project setup fails so Simo never strands customer credits.
            for r in reservations:
                try:self.credits.release(r,"long_video_project_setup_failed")
                except Exception:pass
            if planner_reservation:
                try:self.credits.release(planner_reservation,"long_video_project_setup_failed")
                except Exception:pass
            if orchestration_reservation:
                try:self.credits.release(orchestration_reservation,"long_video_project_setup_failed")
                except Exception:pass
            if pid:
                try:self.store.delete(pid,owner)
                except Exception:pass
            raise

        plan["planner_reservation"]=planner_reservation
        root=self._audio_state_path(pid).parent
        plan["_phase"]="queued"
        try:
            (root/"production_plan.json").write_text(json.dumps(plan),encoding="utf-8")
            self.store.update_project(pid,owner,error="Simo is preparing your complete storyline and audio…")
            self._launch_worker(pid,owner,plan)
        except Exception:
            state=self._read_audio_state(pid) or {}
            # Only a preparation that has provably not started may be refunded.
            if not state:
                for scene in self.store.scenes_private(pid,owner):
                    self._release_once(scene,"long_video_worker_not_started")
                    self.store.update_scene(scene["id"],owner,status="canceled")
                self._release_orchestration_once(pid,owner,"long_video_worker_not_started")
                if planner_reservation:self.credits.release(planner_reservation,"long_video_worker_not_started")
                self.store.update_project(pid,owner,status="failed",error="Production could not start; unspent reservations were released.")
            raise
        return self.store.project_public(pid,owner)

    def _prepare_project(self,pid,owner,plan):
        planner_reservation=plan.get("planner_reservation")
        try:
            plan["planner_reservation"]=planner_reservation
            self._begin_master_audio(pid,plan)
            if not plan["master_audio_specs"] and not plan.get("local_music") and not plan.get("needs_story"):
                self._start_next_scene(pid,owner)
        except Exception as exc:
            state=self._read_audio_state(pid) or {}
            if planner_reservation and state.get("planner_status") not in {"attempted","completed"}:
                self.credits.release(planner_reservation,"long_video_script_not_started")
            if any(x.get("status")=="submission_pending" and not x.get("id") for x in state.get("items",{}).values()):
                self.store.update_project(pid,owner,status="creating",error="A speech submission returned no saved result. Simo paused without retrying or releasing its reserved cost: "+str(exc)[:250])
                raise
            scenes=self.store.scenes_private(pid,owner)
            queued=next((s for s in scenes if s["status"]=="queued"),None)
            if plan.get("master_audio_specs") or plan.get("local_music") or plan.get("needs_story"):
                self._fail_unstarted(pid,owner,exc)
            elif queued:
                self._fail_scene_and_release_future(pid,owner,queued["id"],
                    f"Simo could not start provider generation: {exc}")
            else:
                self._fail_unstarted(pid,owner,exc)
            raise

    @contextmanager
    def _production_lease(self,pid):
        token=secrets.token_hex(16)
        acquired=self.store.acquire_lease(pid,token)
        stop=threading.Event()
        if acquired:
            def heartbeat():
                while not stop.wait(20):
                    self.store.renew_lease(pid,token)
            threading.Thread(target=heartbeat,daemon=True).start()
        try:yield acquired
        finally:
            stop.set()
            if acquired:self.store.release_lease(pid,token)

    def _launch_worker(self,pid,owner,plan=None):
        from flask import copy_current_request_context,has_request_context
        if not has_request_context():
            # Direct service tests and embedding callers may choose explicit
            # synchronous preparation; HTTP production always returns promptly.
            if plan:self._prepare_project(pid,owner,plan)
            return
        with self._worker_lock:
            if pid in self._workers:return
            self._workers.add(pid)
        @copy_current_request_context
        def run():
            try:
                if plan:
                    with self._production_lease(pid) as acquired:
                        if not acquired:return
                        plan["_phase"]="preparing"
                        (self._audio_state_path(pid).parent/"production_plan.json").write_text(json.dumps(plan),encoding="utf-8")
                        self._prepare_project(pid,owner,plan)
                        plan["_phase"]="ready"
                        (self._audio_state_path(pid).parent/"production_plan.json").write_text(json.dumps(plan),encoding="utf-8")
                while True:
                    with self._production_lease(pid) as acquired:
                        if not acquired:return
                        p=self._refresh_impl(pid)
                    if not p or p.get("status") in {"succeeded","failed","canceled","assembly_pending"}:break
                    scenes=self.store.scenes_private(pid,owner)
                    if any(x["status"] in {"creating","processing"} and not x.get("provider_job_id") for x in scenes):break
                    if any(x.get("status")=="submission_pending" for x in (self._read_audio_state(pid) or {}).get("items",{}).values()):break
                    time.sleep(3)
            except Exception as exc:
                current=self.store.project_private(pid,owner) or {}
                if current.get("status") not in {"failed","canceled","succeeded"}:
                    self.store.update_project(pid,owner,error="Simo paused production safely: "+str(exc)[:350])
            finally:
                with self._worker_lock:self._workers.discard(pid)
        threading.Thread(target=run,name="simo-long-"+pid,daemon=True).start()

    def _router_ids_for(self, spec):
        """Only configured providers; quote and create use the same locked route."""
        locked = str(spec.get("_simo_approved_router") or "").strip()
        if locked:
            return [locked]
        quality = str(spec.get("output_resolution") or "1080p").lower()
        if quality == "4k":
            premium = str(os.getenv("SIMO_VIDEO_RUNWAY_4K_CONFIG_ID") or "").strip()
            if not premium:
                raise ProviderError("Simo 4K premium routing is not configured; no charge.")
            return [premium]
        # Video scenes are silent because master narration/music are mixed later.
        # Try the dedicated visual route before the separately configured audio route.
        configs = [self.config.runway_config_id, self.config.runway_audio_config_id]
        return list(dict.fromkeys(str(c).strip() for c in configs if str(c or "").strip()))

    def _client_for(self, spec):
        route_ids = self._router_ids_for(spec)
        if not route_ids:
            raise ProviderError("No protected video route configured; no charge.")
        return RunwayRouterClient(self.config.runway_api_key, route_ids[0], self.config.runway_api_base)

    def _protected_scene_quote(self, spec):
        """Fail closed, dry-run candidate routes, and lock exactly one for creation.

        No unquoted route is allowed to make a paid call. The selected config ID is
        persisted in each scene spec, keeping polls and rechecks on the same route.
        """
        if spec.get("_simo_brand_finale"):
            if not (Path(__file__).parent/"assets"/"simo-logo.png").is_file():
                raise RuntimeError("The approved Simo closing logo is missing; no generation started.")
            return {"estimated_provider_credits":0,"estimated_simo_credits":2,
                    "model":"local-authentic-logo","resolution":spec.get("resolution") or "1080p"}
        candidates = self._router_ids_for(spec)
        errors = []
        selected = None
        for config_id in candidates:
            trial = RunwayRouterClient(self.config.runway_api_key, config_id, self.config.runway_api_base)
            try:
                quote_spec=spec
                if spec.get("_simo_chain_previous") and not spec.get("reference_images"):
                    quote_spec={**spec,"reference_images":self._reference_frame(
                        None,probe=True,aspect_ratio=spec.get("aspect_ratio") or "16:9")}
                try:
                    result = trial.dry_run(quote_spec)
                except ProviderError as exc:
                    # Some router mappings incorrectly pass a fixed pixel ratio
                    # to keyframe-only models. Let the first frame determine it.
                    # This is a second FREE preflight, never a paid fallback.
                    if quote_spec.get("reference_images") and "Keyframe image-to-video" in str(exc):
                        quote_spec={**quote_spec,"_simo_reference_inherit_aspect":True}
                        result=trial.dry_run(quote_spec)
                        spec["_simo_reference_inherit_aspect"]=True
                    else:
                        raise
                # Critical 1080p guard: the router dry-run may approve a
                # duration that the resolved Veo model refuses for real jobs.
                # Reject incompatible inputs *before* any reservation or POST.
                model = str(result.get("model") or "").lower()
                if "veo3.1" in model and str(spec.get("output_resolution") or "").lower() == "1080p" and int(spec.get("duration_seconds") or 0) != 8:
                    raise RuntimeError("The selected 1080p Veo model requires exactly 8-second paid clips.")
                provider_credits = int(result.get("estimated_provider_credits") or 0)
                if provider_credits <= 0:
                    raise RuntimeError("Provider returned no validated price.")
                ceiling = max(1, int(os.getenv("SIMO_VIDEO_RUNWAY_4K_MAX_CREDITS", "1500") if
                    str(spec.get("output_resolution") or "").lower() == "4k" else
                    os.getenv("SIMO_VIDEO_RUNWAY_MAX_CREDITS", "300")))
                if provider_credits > ceiling:
                    raise RuntimeError("Provider scene cost exceeds protected limit.")
                quoted_resolution = str(result.get("resolution") or "").strip().lower()
                # Reject an explicitly lower output resolution before any charges.
                if str(spec.get("output_resolution") or "").lower() == "1080p" and quoted_resolution in {"480p", "540p", "576p", "720p", "1280x720", "720x1280"}:
                    raise RuntimeError("Provider cannot deliver requested 1080p output.")
                # A provider that explicitly resolves below requested output quality
                # must be rejected before charges; never silently upscale and call it 4K.
                if str(spec.get("output_resolution") or "").lower() == "4k" and quoted_resolution and quoted_resolution not in {"4k", "2160p", "3840x2160", "2160x3840"}:
                    raise RuntimeError("Provider cannot deliver requested 4K output.")
                priced = self.short._simo_credit_quote_from_provider_credits(
                    provider_credits,
                    premium_4k=str(spec.get("output_resolution") or "").lower() == "4k",
                    native_audio=bool(spec.get("audio")))
                selected = (config_id, result, provider_credits, priced)
                break
            except Exception as exc:
                errors.append(f"route {len(errors)+1}: {str(exc)[:240]}")
        if selected is None:
            raise RuntimeError("No configured video provider accepts this scene and its protected cost. "
                               "No paid generation started. " + " | ".join(errors))
        config_id, result, provider_credits, priced = selected
        spec["_simo_approved_router"] = config_id
        return {"estimated_provider_credits": provider_credits,
                "estimated_simo_credits": priced,
                "model": result.get("model") or "", "resolution": result.get("resolution") or ""}

    def _reference_frame(self, source, *, probe=False, aspect_ratio="16:9"):
        """Encode one first-frame reference; supports local installations too."""
        ffmpeg=shutil.which(os.getenv("SIMO_FFMPEG_BIN","ffmpeg"))
        if not ffmpeg:
            raise RuntimeError("Connected video generation requires FFmpeg before spending credits.")
        if probe:
            # A free capability check uses a neutral frame, NEVER a paid generation.
            sizes={"16:9":"1280x720","9:16":"720x1280","1:1":"960x960"}
            args=[ffmpeg,"-v","error","-f","lavfi","-i",
                  "color=c=gray:s="+sizes.get(aspect_ratio,"1280x720")]
        else:
            path=Path(source)
            if not path.is_file():
                raise RuntimeError("Previous scene reference is missing; production paused.")
            duration=self._media_duration(path)
            args=[ffmpeg,"-v","error","-ss",str(max(0,duration-0.10)),"-i",str(path)]
        args += ["-frames:v","1","-vf","scale=1280:1280:force_original_aspect_ratio=decrease",
                 "-f","image2pipe","-c:v","mjpeg","-q:v","3","-threads","1","pipe:1"]
        result=subprocess.run(args,capture_output=True,timeout=30)
        if result.returncode or not result.stdout:
            raise RuntimeError("Simo could not extract a visual continuity frame; no new scene started.")
        uri="data:image/jpeg;base64,"+base64.b64encode(result.stdout).decode("ascii")
        if len(uri)>5_000_000:
            raise RuntimeError("Visual continuity frame exceeds provider input limit.")
        return [{"uri":uri,"role":"first"}]

    def _start_next_scene(self,pid,owner):
        scenes=self.store.scenes_private(pid,owner)
        for s in scenes:
            if s["status"]=="queued":
                posted=False
                try:
                    # Re-check protected cost and provider startup before spending.
                    live_spec=dict(s["spec"])
                    if live_spec.get("_simo_brand_finale"):
                        from .finishing import create_brand_scene
                        dims={"16:9":(1920,1080),"9:16":(1080,1920),"1:1":(1080,1080),"4:5":(1080,1350)}
                        width,height=dims.get(live_spec.get("aspect_ratio"),(1920,1080))
                        if live_spec.get("output_resolution")=="4k":width*=2;height*=2
                        target=self._audio_state_path(pid).parent/(s["id"]+".mp4")
                        path=create_brand_scene(target,live_spec["duration_seconds"],width,height)
                        live_spec["_simo_local_brand_card"]=True
                        self.store.update_scene(s["id"],owner,status="succeeded",local_media_path=str(path),
                            spec_json=json.dumps(live_spec),error="",reservation_state="reserved")
                        return
                    if live_spec.get("_simo_chain_previous"):
                        previous=next((x for x in scenes if int(x["scene_index"])==int(s["scene_index"])-1),None)
                        if not previous or previous["status"]!="succeeded":
                            raise RuntimeError("Previous scene is not ready for visual continuity.")
                        live_spec["reference_images"]=self._reference_frame(previous.get("local_media_path"))
                    q=self._protected_scene_quote(live_spec)
                    if int(q["estimated_simo_credits"])>int(s["required_credits"]):
                        self._fail_scene_and_release_future(pid,owner,s["id"],"Protected scene price changed before generation.")
                        return
                    self.store.update_scene(s["id"],owner,status="creating",spec_json=json.dumps(live_spec),error="")
                    posted=True
                    self.credits.mark_started(s.get("reservation") or {})
                    result=self._client_for(live_spec).create(live_spec)
                    self.store.update_scene(s["id"],owner,status=result.status,provider_job_id=result.provider_job_id,error="")
                except Exception as exc:
                    if posted:
                        # A confirmed provider HTTP 400 is a rejection, not an
                        # unknown accepted job. Refund failed/unstarted scenes
                        # once, and close the project instead of hanging forever.
                        # Connection errors/timeouts remain paused: a task may
                        # have been accepted even without a returned ID.
                        definitively_rejected = (isinstance(exc, ProviderError)
                            and re.search(r"request failed \(400\)",str(exc),re.I))
                        if definitively_rejected:
                            self._fail_scene_and_release_future(pid,owner,s["id"],
                                "Video provider rejected scene %d (HTTP 400): %s" %
                                (int(s["scene_index"])+1,str(exc)[:300]))
                            return
                        self.store.update_project(pid,owner,status="creating",error="A video submission returned no saved result. Simo paused instead of risking a duplicate charge: "+str(exc)[:250])
                        return
                    self._fail_scene_and_release_future(pid,owner,s["id"],
                        f"Simo could not start scene {s['scene_index']+1}: {exc}")
                    raise
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
        self.credits.consume(p.get("orchestration_reservation") or {})
        self.store.update_project(
            pid,owner,
            orchestration_reservation_state="consumed",
            orchestration_reservation_json="{}",
        )

    def _release_once(self,s,reason):
        if str(s.get("reservation_state") or "")!="reserved":return
        self.credits.release(s.get("reservation") or {},reason)
        self.store.update_scene(s["id"],s["owner_key"],reservation_state="released",reservation_json="{}")

    def _refund_failed_delivery(self,pid,owner,reason):
        # Keep successful scene reservations until a verified complete delivery.
        # Provider expenses are separate from customer credit refunds.
        for scene in self.store.scenes_private(pid,owner):
            self._release_once(scene,reason)
        self._release_orchestration_once(pid,owner,reason)
        state=self._read_audio_state(pid) or {}
        reservation=state.get("planner_reservation")
        if reservation and not state.get("planner_refunded"):
            self.credits.release(reservation,reason)
            state["planner_refunded"]=True
            self._write_audio_state(pid,state)

    def _fail_scene_and_release_future(self,pid,owner,sid,reason):
        scenes=self.store.scenes_private(pid,owner)
        for s in scenes:
            if s["id"]==sid:
                self._release_once(s,"long_video_scene_failed")
                self.store.update_scene(s["id"],owner,status="failed",error=reason)
            elif s["status"]=="queued":
                self._release_once(s,"long_video_unstarted_scene_released")
                self.store.update_scene(s["id"],owner,status="canceled",error="Project stopped before this scene was generated.")
        self._refund_failed_delivery(pid,owner,"long_video_project_failed")
        self.store.update_project(pid,owner,status="failed",error=reason)

    def refresh(self,pid):
        owner=self.owner()
        project=self.store.project_private(pid,owner)
        if not project:return None
        if project["status"] in {"succeeded","failed","canceled"}:
            if project["status"] == "failed":
                with self._production_lease(pid) as acquired:
                    if acquired:self._refund_failed_delivery(pid,owner,"long_video_failed_delivery_reconciled")
            return self.store.project_public(pid,owner)
        with self._production_lease(pid) as acquired:
            if not acquired:return self.store.project_public(pid,owner)
            # Never restart a paid planner or speech POST whose result is unknown.
            state=self._read_audio_state(pid)
            if state and state.get("planner_status")=="attempted":
                self.store.update_project(pid,owner,error="Story preparation was interrupted. Simo has paused without repeating the paid request.")
                return self.store.project_public(pid,owner)
            # An HTTP status request only reads. The worker owns heavy assembly.
        plan_path=self._audio_state_path(pid).parent/"production_plan.json"
        pending_plan=None
        if plan_path.exists():
            recorded=json.loads(plan_path.read_text(encoding="utf-8"))
            if recorded.get("_phase")=="preparing":
                self.store.update_project(pid,owner,error="Simo is preparing the complete production; an interrupted paid preparation is never automatically repeated.")
                return self.store.project_public(pid,owner)
            if recorded.get("_phase")=="queued":pending_plan=recorded
        self._launch_worker(pid,owner,pending_plan)
        return self.store.project_public(pid,owner)

    def _refresh_impl(self,pid):
        owner=self.owner(); p=self.store.project_private(pid,owner)
        if not p:return None
        if p["status"] in {"succeeded","failed","canceled"}:return self.store.project_public(pid,owner)
        scenes=self.store.scenes_private(pid,owner)
        # Reconcile legacy projects whose scene failure was overwritten by the
        # broad audio/network handler. Never restart or change credit records.
        failed=next((scene for scene in scenes if scene["status"] in {"failed","canceled"}),None)
        in_flight=any(scene["status"] in {"creating","processing","storage_pending"}
                      and scene.get("provider_job_id") for scene in scenes)
        if failed and not in_flight:
            self._refund_failed_delivery(pid,owner,"long_video_failed_delivery_reconciled")
            self.store.update_project(pid,owner,status="failed",
                error=failed.get("error") or "Production stopped after a scene failed.")
            return self.store.project_public(pid,owner)
        active=next((s for s in scenes if s["status"] in {"queued","creating","processing","storage_pending"} and s.get("provider_job_id")),None)
        if active:
            try:r=self._client_for(active["spec"]).poll(active["provider_job_id"])
            except Exception as exc:
                # Preserve provider job and reserved credits; never restart a paid scene
                # because polling failed. Surface the actual blocker to the operator.
                problem="Simo could not check existing scene %s with its provider: %s" % (
                    int(active["scene_index"])+1, str(exc)[:320])
                self.store.update_project(pid,owner,status="creating",error=problem)
                return self.store.project_public(pid,owner)
            if r.status in {"failed","canceled"}:
                self._fail_scene_and_release_future(pid,owner,active["id"],r.error or "A scene failed to generate.")
                return self.store.project_public(pid,owner)
            if r.status=="succeeded":
                try:
                    path=self._download_scene(pid,active["id"],r.output_url)
                    self.store.update_scene(active["id"],owner,status="succeeded",local_media_path=path,reservation_state="reserved",error="")
                    self._start_next_scene(pid,owner)
                except Exception as exc:
                    # Keep the known successful provider job. Retry retrieval,
                    # never purchase another generation because a download failed.
                    latest = self.store.scenes_private(pid, owner)
                    saved = next((item for item in latest if item["id"] == active["id"]), active)
                    if saved["status"] != "succeeded":
                        self.store.update_scene(active["id"],owner,status="storage_pending",error=str(exc)[:320])
                    self.store.update_project(pid,owner,status="creating",error="Recovering the existing scene file: "+str(exc)[:320])
            else:self.store.update_scene(active["id"],owner,status=r.status,error="")
        else:
            # A recorded scene already marked in progress but missing its provider
            # job ID must never silently advance to another paid scene. This case
            # requires reconciliation against provider transaction records.
            untracked=next((s for s in scenes if s["status"] in
                {"creating","processing","storage_pending"} and not s.get("provider_job_id")),None)
            if untracked:
                self.store.update_project(pid,owner,status="creating",error=(
                    "Scene %s is marked in progress but has no saved provider job ID. "
                    "Simo has paused automatic progression to prevent duplicate charges."
                    % (int(untracked["scene_index"])+1)))
                return self.store.project_public(pid,owner)
            try:
                if self._advance_master_audio(pid,owner):
                    self._start_next_scene(pid,owner)
                else:
                    self.store.update_project(pid,owner,status="creating",error="Simo is preparing one continuous narration and soundtrack.")
            except (OSError, TimeoutError, ConnectionError, ProviderError) as exc:
                # Scene startup may already have recorded a definitive failure.
                # Preserve it instead of relabeling it as an audio wait.
                current=self.store.project_private(pid,owner) or {}
                if current.get("status") in {"failed","canceled"}:
                    return self.store.project_public(pid,owner)
                # Network polling failures are inconclusive: a paid task may still run.
                self.store.update_project(pid,owner,status="creating",error="Simo could not check the existing audio task: " + str(exc)[:320] + ". No new generation was started.")
            except Exception as exc:
                self._fail_unstarted(pid,owner,exc)
        return self.store.project_public(pid,owner)

    def _download_scene(self,pid,sid,url):
        if not str(url).startswith("https://"):raise RuntimeError("Provider returned no secure scene URL.")
        root=Path(self.config.storage_dir)/"long_video"/pid; root.mkdir(parents=True,exist_ok=True)
        target=root/(sid+".mp4")
        import urllib.request
        with urllib.request.urlopen(url,timeout=120) as resp, open(target,"wb") as fh:
            shutil.copyfileobj(resp,fh)
        return str(target)

    def _prepare_long_visuals(self,pid,scenes,expected_seconds):
        """Normalize each clip separately: bounded memory and exact video timing.

        Per-scene audio/container tails must never accumulate on a long timeline.
        All soundtrack audio is mixed once after this silent visual assembly.
        """
        if not scenes:raise RuntimeError("No video scenes are ready.")
        ffmpeg=shutil.which(os.getenv("SIMO_FFMPEG_BIN","ffmpeg"))
        ffprobe=shutil.which(os.getenv("SIMO_FFPROBE_BIN","ffprobe"))
        if not ffmpeg or not ffprobe:raise RuntimeError("FFmpeg and FFprobe are required for final production.")
        root=self._audio_state_path(pid).parent
        probe=subprocess.run([ffprobe,"-v","error","-select_streams","v:0","-show_entries",
            "stream=width,height","-of","csv=p=0:s=x",scenes[0]["local_media_path"]],capture_output=True,text=True,timeout=30)
        width,height=map(int,probe.stdout.strip().split("x"))
        normalized=[]
        for index,scene in enumerate(scenes):
            seconds=float(scene.get("duration_seconds") or scene.get("spec",{}).get("duration_seconds") or 0)
            target=root/("normalized_%04d.mp4"%index)
            valid=False
            if target.exists():
                try:valid=abs(self._media_duration(target)-seconds)<.04
                except Exception:pass
            if not valid:
                temporary=root/("normalized_%04d.tmp.mp4"%index)
                filt=(f"setpts=PTS-STARTPTS,fps=30,scale={width}:{height}:force_original_aspect_ratio=decrease,"
                      f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration=0.2,trim=duration={seconds},setpts=PTS-STARTPTS")
                proc=subprocess.run([ffmpeg,"-y","-v","error","-i",scene["local_media_path"],
                    "-map","0:v:0","-an","-vf",filt,"-c:v","libx264","-threads","2",
                    "-preset","veryfast","-crf","19","-pix_fmt","yuv420p",str(temporary)],
                    capture_output=True,text=True,timeout=max(180,int(seconds*10)))
                if proc.returncode:raise RuntimeError("Clip normalization failed; original paid scenes are preserved: "+proc.stderr[-250:])
                temporary.replace(target)
            normalized.append(target)
        manifest=root/"normalized_concat.txt"
        manifest.write_text("\n".join("file '"+x.resolve().as_posix().replace("'","'\\''")+"'" for x in normalized)+"\n",encoding="utf-8")
        target=root/"connected_visuals.mp4"
        proc=subprocess.run([ffmpeg,"-y","-v","error","-f","concat","-safe","0","-i",str(manifest),
            "-map","0:v:0","-c:v","copy","-an","-t",str(expected_seconds),"-movflags","+faststart",str(target)],
            capture_output=True,text=True,timeout=max(180,int(expected_seconds)))
        if proc.returncode:raise RuntimeError("Long timeline assembly failed; normalized clips remain available: "+proc.stderr[-250:])
        if abs(self._media_duration(target)-expected_seconds)>.1:
            raise RuntimeError("The assembled timeline does not match the requested duration.")
        return target

    def _prepare_connected_visuals(self, pid, scenes, expected_seconds):
        """Create gentle, duration-preserving visual transitions between paid clips.

        This is a local-only editing stage: NO generation calls, changes to scene
        reservations, music, voiceover, or provider pricing. A transition blends
        the held last frame of one scene with the next scene's opening frames;
        it does not pretend that characters have become reference-consistent.
        """
        seconds=float(os.getenv("SIMO_LONG_VIDEO_TRANSITION_SECONDS", "0.30"))
        # Bound graph size for long productions; use original cuts instead.
        if seconds <= 0 or len(scenes)<2 or len(scenes)>20:
            return self._prepare_long_visuals(pid,scenes,expected_seconds)
        if not (0.10 <= seconds <= 0.75):
            raise RuntimeError("Simo transition duration must be between 0.10 and 0.75 seconds.")
        ffmpeg=shutil.which(os.getenv("SIMO_FFMPEG_BIN","ffmpeg"))
        ffprobe=shutil.which(os.getenv("SIMO_FFPROBE_BIN","ffprobe"))
        if not ffmpeg or not ffprobe:
            raise RuntimeError("Video transitions require FFmpeg and FFprobe.")
        root=Path(self.config.storage_dir)/"long_video"/str(pid)
        root.mkdir(parents=True,exist_ok=True)
        target=root/"connected_visuals.mp4"
        # All clips are normalized to constant frame rate/timebase and first
        # clip's dimensions; xfade otherwise silently fails on dissimilar media.
        first=Path(str(scenes[0]["local_media_path"]))
        probe=subprocess.run([ffprobe,"-v","error","-select_streams","v:0",
            "-show_entries","stream=width,height","-of","csv=p=0:s=x",str(first)],
            capture_output=True,text=True,timeout=30)
        try:
            width,height=map(int,probe.stdout.strip().split("x"))
        except Exception as exc:
            raise RuntimeError("Unable to determine dimensions for cinematic assembly.") from exc
        if width<2 or height<2 or width%2 or height%2:
            raise RuntimeError("Video source has invalid dimensions for transition assembly.")
        args=[ffmpeg,"-y","-v","error","-filter_complex_threads","1"]
        filters=[]
        # Use each quoted duration as the timeline truth, not noisy container PTS.
        durations=[]
        for i,scene in enumerate(scenes):
            path=str(scene.get("local_media_path") or "")
            d=float(scene.get("duration_seconds") or (scene.get("spec") or {}).get("duration_seconds") or 0)
            if d<=seconds+0.2:
                raise RuntimeError("A video scene is too short for the chosen transition.")
            durations.append(d)
            args += ["-i",path]
            pad=seconds if i<len(scenes)-1 else 0
            filters.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,scale={width}:{height}:flags=lanczos,setsar=1,format=yuv420p,trim=duration={d:.6f},tpad=stop_mode=clone:stop_duration={pad:.6f},settb=AVTB,setpts=PTS-STARTPTS[v{i}]")
        previous="v0"
        elapsed=0.0
        for i in range(1,len(scenes)):
            elapsed += durations[i-1]
            offset=elapsed
            name=f"join{i}"
            filters.append(f"[{previous}][v{i}]xfade=transition=fade:duration={seconds:.3f}:offset={offset:.3f}[{name}]")
            previous=name
        # Each outgoing clip has one short transition handle. Overlaps consume
        # those handles, preserving scene timing without a cumulative final freeze.
        # Audio is applied exactly once later.
        filters.append(f"[{previous}]trim=duration={expected_seconds:.3f},setpts=PTS-STARTPTS[connected]")
        args += ["-filter_complex",";".join(filters),"-map","[connected]","-an",
                 "-c:v","libx264","-pix_fmt","yuv420p","-threads","1","-preset","veryfast","-crf","19",
                 "-movflags","+faststart",str(target)]
        proc=subprocess.run(args,capture_output=True,text=True,timeout=max(240,int(expected_seconds*7)))
        if proc.returncode or not target.exists() or not target.stat().st_size:
            raise RuntimeError("Scene transition editing failed; original paid clips are preserved. " +
                " ".join((proc.stderr or "").split())[-450:])
        actual=self._media_duration(target)
        if abs(actual-expected_seconds)>0.75:
            raise RuntimeError(f"Connected video is {actual:.2f}s, expected {expected_seconds:.2f}s. Paid clips preserved.")
        return target

    def _assemble(self,pid,owner):
        scenes=self.store.scenes_private(pid,owner)
        if not scenes or any(s["status"]!="succeeded" for s in scenes):return
        scene_media_error=self._validate_scene_media_before_assembly(scenes)
        if scene_media_error:
            self.store.update_project(pid,owner,status="assembly_pending",error=scene_media_error)
            return
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
        # Prefer one edited visual timeline; retain original concat as the opt-out.
        project=self.store.project_private(pid,owner) or {}
        timeline_seconds=float(project.get("total_seconds") or sum(
            float(x.get("duration_seconds") or (x.get("spec") or {}).get("duration_seconds") or 0)
            for x in scenes))
        try:
            connected=self._prepare_connected_visuals(pid,scenes,timeline_seconds)
            if connected is not None and any((sc.get("spec") or {}).get("_simo_brand_finale") for sc in scenes):
                dims=subprocess.run([os.getenv("SIMO_FFPROBE_BIN","ffprobe"),"-v","error",
                    "-select_streams","v:0","-show_entries","stream=width,height",
                    "-of","csv=p=0:s=x",str(connected)],capture_output=True,text=True,timeout=30)
                w,h=map(int,dims.stdout.strip().split("x"))
                connected=brand_finale(connected,root/"branded_visuals.mp4",timeline_seconds,w,h)
        except Exception as exc:
            self.store.update_project(pid,owner,status="assembly_pending",
                error="Simo could not complete visual transitions: "+str(exc))
            return
        if connected is not None:
            cmd=[ffmpeg,"-y","-i",str(connected.resolve()),"-fflags","+genpts"]
        else:
            cmd=[ffmpeg,"-y","-f","concat","-safe","0","-i",str(listfile.resolve()),"-fflags","+genpts"]
        video_codec=["-c:v","copy"] if connected is not None else ["-c:v","libx264","-preset","medium","-crf","19"]
        state=self._read_audio_state(pid)
        if any((sc.get("spec") or {}).get("audio") for sc in scenes):
            from .finishing import collect_ambience, mix_beds
            ambience=collect_ambience(scenes,root/"master_ambience.wav")
            state=state or {"items":{},"total_seconds":int(timeline_seconds)}
            music=(state.get("items") or {}).get("music",{}).get("file")
            bed=mix_beds(music,ambience,root/"master_background.wav",timeline_seconds) if music else ambience
            state.setdefault("items",{})["music"]={"status":"ready","file":str(bed)}
            state["status"]="ready"
        if state and state.get("status")=="ready":
            voice=(state.get("items") or {}).get("voice",{}).get("file")
            music=(state.get("items") or {}).get("music",{}).get("file")
            total=int(state["total_seconds"])
            if voice:cmd += ["-i",voice]
            if music:cmd += ["-i",music]
            if voice and music:
                # The voice stays clear; music plays continuously below it.
                filt="[1:a]aresample=async=1,loudnorm=I=-16:TP=-2:LRA=7,asplit=2[v][sc];[2:a]aresample=async=1,loudnorm=I=-22:TP=-3:LRA=9,atrim=duration=%d[m];[m][sc]sidechaincompress=threshold=0.03:ratio=3:attack=20:release=350[duck];[v][duck]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.84[outa]"%total
                audio_map="[outa]"
            elif voice:
                filt="[1:a]aresample=async=1,loudnorm=I=-16:TP=-1.5:LRA=11[outa]"
                audio_map="[outa]"
            elif music:
                filt="[1:a]aresample=async=1,atrim=duration=%d,loudnorm=I=-16:TP=-1.5:LRA=11[outa]"%total
                audio_map="[outa]"
            else:
                raise RuntimeError("Master audio state has no finished tracks.")
            cmd += ["-filter_complex",filt,"-map","0:v:0","-map",audio_map,
                    "-t",str(total)] + video_codec + ["-c:a","aac","-b:a","192k"]
            wants_audio=True
        else:
            cmd += video_codec
            if wants_audio:
                cmd += ["-af","aresample=async=1:first_pts=0,loudnorm=I=-16:TP=-1.5:LRA=11","-c:a","aac","-b:a","192k"]
            else:cmd += ["-an"]
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

        # RELEASE GATE: a file existing is not proof of the requested runtime.
        # Some older jobs assembled a valid 30-second MP4 for a 60-second request.
        project=self.store.project_private(pid,owner) or {}
        expected=int(project.get("total_seconds") or sum(int(x.get("duration_seconds") or (x.get("spec") or {}).get("duration_seconds") or 0) for x in scenes))
        if expected <= 0:
            self.store.update_project(pid,owner,status="assembly_pending",error="Simo cannot verify the requested film duration. Existing scenes are preserved.")
            return
        if not ffprobe:
            self.store.update_project(pid,owner,status="assembly_pending",error="FFprobe is required to validate the completed film duration. Existing scenes are preserved.")
            return
        try:
            actual=self._media_duration(final)
        except Exception as exc:
            self.store.update_project(pid,owner,status="assembly_pending",error="Simo could not verify the final video duration. Existing scenes are preserved: "+str(exc))
            return
        # Up to 0.75s container/encoder tolerance, not an arbitrary missing scene.
        if abs(actual-expected)>0.75:
            self.store.update_project(pid,owner,status="assembly_pending",error=f"Requested {expected}s but final video is {actual:.2f}s. Simo will not mark it complete or regenerate paid scenes automatically.")
            return
        if state and state.get("status")=="ready":
            requested_items=state.get("items") or {}
            missing=[name for name in ("voice","music") if name in requested_items and not requested_items[name].get("file")]
            if missing:
                self.store.update_project(pid,owner,status="assembly_pending",error="Required master audio missing: "+", ".join(missing)+". Existing scenes are preserved.")
                return
        for scene in self.store.scenes_private(pid,owner):
            if scene.get("reservation_state") == "reserved":
                self.credits.consume(scene.get("reservation") or {})
                self.store.update_scene(scene["id"],owner,reservation_state="consumed",reservation_json="{}")
        self.credits.consume((self._read_audio_state(pid) or {}).get("planner_reservation"))
        self._consume_orchestration(pid,owner)
        self.store.update_project(pid,owner,status="succeeded",local_media_path=str(final),output_url="/api/long-video/media/"+pid,error="")

    def library(self):
        """Reconcile saved terminal scene failures without provider or credit calls."""
        owner=self.owner()
        for project in self.store.list_projects(owner):
            if project["status"] in {"succeeded","failed","canceled"}:
                continue
            scenes=self.store.scenes_private(project["id"],owner)
            failed=next((x for x in scenes if x["status"]=="failed"),None)
            active=any(x["status"] in {"creating","processing","storage_pending"}
                       and x.get("provider_job_id") for x in scenes)
            if failed and not active:
                self.store.update_project(project["id"],owner,status="failed",
                    error=failed.get("error") or "Production stopped after a scene failed.")
        return self.store.list_projects(owner)

    def public(self,pid):return self.store.project_public(pid,self.owner())
