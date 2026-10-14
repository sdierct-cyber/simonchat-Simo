"""Reserved, bounded story authoring. Never called by the free quote endpoint."""
import json
import math
import os
import re
import urllib.request


class StoryWriter:
    MODEL = "gpt-4.1-mini-2025-04-14"
    MAX_OUTPUT_TOKENS = 30000
    MAX_INPUT_BYTES = 24000

    def __init__(self, api_key, request_fn=None):
        self.api_key = api_key
        self.request_fn = request_fn or self._request

    def quote_credits(self, config):
        # Bound input tokens conservatively by UTF-8 bytes, without assuming a
        # language or tokenizer ratio. Prices verified October 13, 2026.
        ceiling = self.MAX_INPUT_BYTES * .40 / 1_000_000 + self.MAX_OUTPUT_TOKENS * 1.60 / 1_000_000
        revenue = ((ceiling + config.infra_reserve_usd)*1.25) / (1-config.minimum_margin_ratio)
        return max(2, math.ceil(revenue/config.net_usd_per_credit))

    def _request(self, payload):
        req = urllib.request.Request('https://api.openai.com/v1/chat/completions',
            data=json.dumps(payload).encode(), method='POST',
            headers={'Authorization':'Bearer '+self.api_key,'Content-Type':'application/json'})
        # One attempt only: never duplicate a paid authoring call on timeout.
        with urllib.request.urlopen(req,timeout=180) as response:
            return json.loads(response.read())

    def __call__(self, prompt, total_seconds, minimum_words, maximum_words, scene_count, supplied_script=None, narration_required=True):
        if not 10<=int(total_seconds)<=1800:
            raise ValueError('Automatic story authoring supports 10 seconds to 30 minutes.')
        if not 1<=int(scene_count)<=450:
            raise ValueError('Story scene count is outside the supported authoring range.')
        target=(int(minimum_words)+int(maximum_words))//2
        system = (
            'You are Simo, a cinematic story director. Return one JSON object with a scenes array. '
            'Create an original complete coherent story for the request, never repeat a template. '
            'Each scene must have visual_prompt (100 to 280 characters), continuity (cut or continue), and narration (spoken words only). '
            'Visuals must depict the narration spoken during that scene. Use one consistent named subject, '
            'wardrobe and logical progression. Carry identity details when the subject appears; allow story-motivated changes of shot and setting. '
            'Scenes are consecutive equal-time portions of one continuous film; introductions occur only at the start, '
            'the resolution and call to action occur only at the end. Narration is one continuous recording, '
            'without scene labels, repeated introductions, production instructions or timestamps. '
            'For a Simo demo, explain AI conversation, website creation, design and image work, business ideation, '
            'writing and books, and narrated video creation. Show a different concrete feature result in each demonstration shot: full-frame website, branded artwork, business concept, written document, book, and finished film. Spend at least three quarters of demo shots on the results themselves. Avoid repeatedly showing someone sitting at a laptop or floating icons. Set continuity to cut for a new feature result or a transition away from a logo; continue only when extending the same physical shot. Do not promise unlimited usage, guaranteed outcomes, '
            'or capabilities outside the request. End with the invitation to visit simonchat.ai. '
            'Never invent a Simo logo or write generated text on screen; the authentic end card is composited later. '
            'For heaven or other imagined settings, present an imaginative interpretation rather than factual certainty.'
        )
        fixed=None
        if supplied_script is not None:
            words=str(supplied_script).split()
            fixed=[' '.join(words[i*len(words)//scene_count:(i+1)*len(words)//scene_count]) for i in range(scene_count)]
            system+=' The supplied scene_narration is authoritative; return only visual_prompt for each scene and depict its exact words. Do not rewrite the script.'
        elif not narration_required:
            fixed=['']*scene_count
            system+=' This film has no spoken narration. Return only visual_prompt for each scene, developing a complete visual story without written or spoken exposition.'
        user = json.dumps({'request':prompt,'duration_seconds':int(total_seconds),
            'required_scene_count':int(scene_count),'target_total_narration_words':target,
            'minimum_total_words':int(minimum_words),'maximum_total_words':int(maximum_words),
            'words_per_scene_about':max(1,round(target/scene_count)),
            'final_logo_hold_seconds':3,'scene_narration':fixed},ensure_ascii=False)
        payload={'model':self.MODEL,'messages':[{'role':'system','content':system},
            {'role':'user','content':user}],'response_format':{'type':'json_object'},
            'max_tokens':self.MAX_OUTPUT_TOKENS,'temperature':.8}
        if len((system+user).encode())>self.MAX_INPUT_BYTES:
            raise ValueError('Story instructions exceed the protected authoring input budget.')
        response=self.request_fn(payload)
        choice=response['choices'][0]
        if choice.get('finish_reason')!='stop':
            raise RuntimeError('The story writer did not finish the complete story; video scenes have not started.')
        result=json.loads(choice['message']['content'])
        scenes=result.get('scenes')
        if not isinstance(scenes,list) or len(scenes)!=scene_count:
            raise RuntimeError('The story writer returned an incomplete scene plan; video scenes have not started.')
        directions=[];spoken=[];continuity=[]
        for index,scene in enumerate(scenes):
            if not isinstance(scene,dict):raise RuntimeError('Invalid story scene.')
            visual=' '.join(str(scene.get('visual_prompt') or '').split())
            narration=fixed[index] if fixed is not None else ' '.join(str(scene.get('narration') or '').split())
            if not visual or len(visual)>360 or (fixed is None and not narration):
                raise RuntimeError('A story scene has missing or overlong directions.')
            directions.append(visual);spoken.append(narration)
            continuity.append(scene.get("continuity") == "continue")
        script=' '.join(spoken).strip()
        words=len(re.findall(r"\b[\w’'-]+\b",script))
        if fixed is None and not minimum_words<=words<=maximum_words:
            raise RuntimeError('The written narration does not cover the requested film duration; video scenes have not started.')
        return {'narration':script,'scene_prompts':directions,'scene_narration':spoken,'scene_continuity':continuity}


def configured_writer():
    key=(os.getenv('OPENAI_API_KEY') or '').strip()
    return StoryWriter(key) if key else None
