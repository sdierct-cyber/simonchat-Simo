"""Simo-owned, deterministic instrumental underscore. No third-party music API.
This is a simple synthesized soundtrack, not a substitute for professional composition.
"""
import math
try:
    import numpy as np
except ImportError:
    np = None
import struct
import wave
from pathlib import Path

RATE = 22050

def create_score(path, duration, mood='cinematic'):
    duration = int(duration)
    if not 5 <= duration <= 43200:
        raise ValueError('Local Simo soundtrack supports 5 seconds to 12 hours.')
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Original, evolving four-bar chord progression with a gentle pulse.
    # Oscillators are deliberately quiet beneath spoken narration.
    progression = [(130.81, 164.81, 196.00), (98.00, 123.47, 146.83),
                   (110.00, 130.81, 164.81), (87.31, 110.00, 130.81)]
    section = 16 * 60 / 108
    chord_seconds = 8 * 60 / 108
    total = duration * RATE
    chunk = 22050
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        for start in range(0,total,chunk):
            if np is not None:
                t = np.arange(start, min(total, start + chunk), dtype=np.float64) / RATE
                chords = np.asarray(progression)[(t / chord_seconds).astype(np.int64) % len(progression)]
                p = np.minimum(1.0, t / max(3.0, duration * .18))
                end = np.minimum(1.0, np.maximum(0.0, (duration-t)/max(2.,duration*.07)))
                swell = .58 + .42 * np.sin(2*np.pi*t/section)**2
                chord = np.sum(np.sin(2*np.pi*chords*t[:,None])*.19 +
                               np.sin(2*np.pi*(2*chords)*t[:,None])*.035, axis=1)
                bass = .22*np.sin(2*np.pi*(chords[:,0]/2)*t)
                shimmer = .045*np.sin(2*np.pi*659.25*t)*p
                beat = t * 108 / 60
                pulse = .13*np.sin(2*np.pi*55*t)*np.exp(-18*(beat%1.0))*p
                notes = np.take_along_axis(chords, ((beat*2).astype(np.int64)%3)[:,None],axis=1)[:,0]*2
                piano = .18*(np.sin(2*np.pi*notes*t)+.25*np.sin(4*np.pi*notes*t))*np.exp(-5*((beat*2)%1.0))*p
                pulse += piano
                signal = (chord*swell + bass + shimmer + pulse)*p*end*.42
                packed = np.clip(signal*32767, -32767, 32767).astype('<i2').tobytes()
                out.writeframesraw(packed)
                continue
            packed = bytearray()
            for i in range(start,min(total,start+chunk)):
                t = i / RATE
                c = progression[int(t/chord_seconds) % len(progression)]
                p = min(1.0, t / max(3.0, duration * .18))
                end = min(1.0, max(0.,(duration-t)/max(2.,duration*.07)))
                swell = .58 + .42*math.sin(2*math.pi*t/section)**2
                # Synth-pad: blended fundamentals, harmonics and an octave-high shimmer.
                chord = sum(math.sin(2*math.pi*f*t)*.19 + math.sin(2*math.pi*(2*f)*t)*.035 for f in c)
                bass = .22*math.sin(2*math.pi*(c[0]/2)*t)
                shimmer = .045*math.sin(2*math.pi*659.25*t)*p
                beat=t*108/60
                beat_position=beat%1.0
                pulse=.13*math.sin(2*math.pi*55*t)*math.exp(-18*beat_position)*p
                note=c[int(beat*2)%3]*2
                pulse+=.18*(math.sin(2*math.pi*note*t)+.25*math.sin(4*math.pi*note*t))*math.exp(-5*((beat*2)%1.0))*p
                signal=(chord*swell + bass + shimmer + pulse)*p*end*.42
                packed += struct.pack('<h',max(-32767,min(32767,int(signal*32767))))
            out.writeframesraw(packed)
    return str(path)
