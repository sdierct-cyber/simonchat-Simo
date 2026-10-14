"""Local finishing helpers; never call a provider or mutate credits."""
import shutil, subprocess, os
from pathlib import Path

def _font_option():
    # Windows FFmpeg builds often have no Fontconfig installation. Loading an
    # existing font file directly avoids that dependency for domain text.
    candidates=[os.getenv('SIMO_VIDEO_FONT_FILE',''),
        str(Path(os.getenv('WINDIR','C:/Windows'))/'Fonts'/'segoeui.ttf'),
        str(Path(os.getenv('WINDIR','C:/Windows'))/'Fonts'/'arial.ttf'),
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
    for value in candidates:
        if value and Path(value).is_file():
            path=Path(value).resolve().as_posix().replace(':','\\:').replace("'","\\'")
            return "fontfile='"+path+"':"
    raise RuntimeError('No usable font file found. Set SIMO_VIDEO_FONT_FILE to an existing TTF file.')

def create_brand_scene(target,seconds,width=1920,height=1080):
    """Compose approved branding as graphics, without a generation provider."""
    ffmpeg=shutil.which(os.getenv('SIMO_FFMPEG_BIN','ffmpeg'))
    logo=Path(__file__).parent/'assets'/'simo-logo.png'
    if not ffmpeg or not logo.is_file():raise RuntimeError('Authentic Simo logo or FFmpeg is missing.')
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    lw=max(2,int(width*.78)//2*2);lh=max(2,int(height*.50)//2*2)
    graph=(f'[1:v]scale={lw}:{lh}:force_original_aspect_ratio=decrease,format=rgba[logo];'
           f'[0:v][logo]overlay=(W-w)/2:(H-h)/2-H*0.06:eof_action=repeat[v];'
           f'[v]drawtext={_font_option()}text=\'simonchat.ai\':fontcolor=white:fontsize={max(16,int(height*.045))}:x=(w-text_w)/2:y=h*0.76[out]')
    temporary=target.with_name(target.stem+'.tmp.mp4')
    result=subprocess.run([ffmpeg,'-y','-v','error','-filter_complex_threads','1',
        '-f','lavfi','-i',f'color=c=0x071322:s={int(width)}x{int(height)}:r=30',
        '-i',str(logo),'-filter_complex',graph,'-map','[out]','-an','-t',str(seconds),
        '-c:v','libx264','-pix_fmt','yuv420p','-threads','1','-preset','veryfast','-crf','19',
        '-movflags','+faststart',str(temporary)],capture_output=True,text=True,timeout=180)
    if result.returncode:raise RuntimeError('Logo ending composition failed: '+result.stderr[-500:])
    os.replace(temporary,target)
    return target

def pace_narration(source, target, actual_seconds, total_seconds, hold_seconds=3):
    desired=float(total_seconds)-float(hold_seconds)
    if desired<=0 or actual_seconds<=0:
        raise RuntimeError('Invalid narration timing.')
    tempo=float(actual_seconds)/desired
    if not 0.85<=tempo<=1.15:
        raise RuntimeError(
            'Narration runs %.1fs; this %ss film needs approximately %.1fs of speech. '
            'Simo stopped before video scenes to avoid an unnatural voice or a long silent ending.'
            % (actual_seconds,total_seconds,desired))
    ffmpeg=shutil.which(os.getenv('SIMO_FFMPEG_BIN','ffmpeg'))
    if not ffmpeg:raise RuntimeError('Narration mastering requires FFmpeg.')
    result=subprocess.run([ffmpeg,'-y','-v','error','-i',str(source),'-af',
        'atempo=%.8f,apad,atrim=duration=%.6f'%(tempo,desired),
        '-ar','48000','-c:a','pcm_s16le',str(target)],capture_output=True,text=True,timeout=120)
    if result.returncode:raise RuntimeError('Narration pacing failed; original recording preserved.')
    return str(target)

def brand_finale(source,target,total_seconds,width,height):
    ffmpeg=shutil.which(os.getenv('SIMO_FFMPEG_BIN','ffmpeg'))
    logo=Path(__file__).parent/'assets'/'simo-logo.png'
    if not ffmpeg or not logo.is_file():raise RuntimeError('Authentic Simo finale assets unavailable.')
    start=max(0,float(total_seconds)-3)
    # A clean end card hides generated imitation branding. Contain, never crop.
    lw=max(2,int(width*.78)//2*2);lh=max(2,int(height*.50)//2*2)
    graph=(f'[0:v]drawbox=x=0:y=0:w=iw:h=ih:color=0x071322:t=fill:enable=\'gte(t,{start})\'[base];'
           f'[1:v]scale={lw}:{lh}:force_original_aspect_ratio=decrease,format=rgba[logo];'
           f'[base][logo]overlay=(W-w)/2:(H-h)/2-H*0.06:enable=\'gte(t,{start})\':eof_action=repeat[v]')
    # drawtext must be supported for the exact domain; fail clearly otherwise.
    graph+=f';[v]drawtext={_font_option()}text=\'simonchat.ai\':fontcolor=white:fontsize={max(16,int(height*.045))}:x=(w-text_w)/2:y=h*0.76:enable=\'gte(t,{start})\'[out]'
    result=subprocess.run([ffmpeg,'-y','-v','error','-filter_complex_threads','1',
        '-i',str(source),'-i',str(logo),'-filter_complex',graph,'-map','[out]',
        '-an','-t',str(total_seconds),'-c:v','libx264','-pix_fmt','yuv420p',
        '-threads','1','-preset','veryfast','-crf','19',str(target)],
        capture_output=True,text=True,timeout=max(180,int(total_seconds*5)))
    if result.returncode:raise RuntimeError('Authentic logo composition failed; existing scenes preserved: '+result.stderr[-300:])
    return Path(target)


def join_narration(sources, target):
    """Join speech-service segments in order, independent of video scene cuts."""
    if not sources:raise RuntimeError("No narration segments are ready.")
    ffmpeg=shutil.which(os.getenv('SIMO_FFMPEG_BIN','ffmpeg'))
    if not ffmpeg:raise RuntimeError('Narration mastering requires FFmpeg.')
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    normalized=[]
    for index,source in enumerate(sources):
        path=target.parent/('speech_pcm_%04d.wav'%index)
        result=subprocess.run([ffmpeg,'-y','-v','error','-i',str(source),
            '-ar','48000','-ac','1','-c:a','pcm_s16le',str(path)],capture_output=True,text=True,timeout=120)
        if result.returncode:raise RuntimeError('A narration segment could not be normalized; originals are preserved.')
        normalized.append(path)
    manifest=target.parent/'speech_concat.txt'
    lines=["file '"+p.resolve().as_posix().replace("'","'\\''")+"'" for p in normalized]
    manifest.write_text('\n'.join(lines)+'\n',encoding='utf-8')
    result=subprocess.run([ffmpeg,'-y','-v','error','-f','concat','-safe','0',
        '-i',str(manifest),'-c:a','pcm_s16le',str(target)],capture_output=True,text=True,timeout=180)
    if result.returncode:raise RuntimeError('Continuous narration assembly failed; source recordings are preserved.')
    return str(target)


def collect_ambience(scenes,target):
    """Keep requested native scene sounds on one exactly timed ambient track."""
    ffmpeg=shutil.which(os.getenv('SIMO_FFMPEG_BIN','ffmpeg'))
    if not ffmpeg:raise RuntimeError('Natural sound assembly requires FFmpeg.')
    target=Path(target);segments=[]
    for index,scene in enumerate(scenes):
        seconds=float(scene.get('duration_seconds') or scene.get('spec',{}).get('duration_seconds'))
        p=target.parent/('ambience_%04d.wav'%index)
        proc=subprocess.run([ffmpeg,'-y','-v','error','-i',scene['local_media_path'],
            '-map','0:a:0','-af',f'aresample=async=1:first_pts=0,apad,atrim=duration={seconds}',
            '-ar','48000','-ac','1','-c:a','pcm_s16le',str(p)],capture_output=True,text=True,timeout=120)
        if proc.returncode:raise RuntimeError('A scene did not provide its requested natural sound; original clips remain safe.')
        segments.append(p)
    return join_narration(segments,target)


def mix_beds(music,ambience,target,total):
    ffmpeg=shutil.which(os.getenv('SIMO_FFMPEG_BIN','ffmpeg'))
    graph=(f'[0:a]volume=0.7[m];[1:a]volume=0.35[a];'
           f'[m][a]amix=inputs=2:duration=longest:normalize=0,apad,atrim=duration={float(total)}[bed]')
    proc=subprocess.run([ffmpeg,'-y','-v','error','-i',str(music),'-i',str(ambience),
        '-filter_complex',graph,'-map','[bed]','-ar','48000','-c:a','pcm_s16le',str(target)],
        capture_output=True,text=True,timeout=max(180,int(total)))
    if proc.returncode:raise RuntimeError('Continuous background mixing failed; original audio is preserved.')
    return str(target)
