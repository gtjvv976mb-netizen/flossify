#!/usr/bin/env python3
"""Join the exterior approach onto the front of the interior take, uncut.

    python3 scripts/film-join.py <approach.mp4> <take.mp4> <out-dir>

The approach is generated to *end* on the take's first frame (Higgsfield
`end_image`), so the two meet on the same picture. This finds the approach
frame that matches the take's frame 0 best (SSIM), cuts the approach there,
matches its colour to the take if the model drifted, and blends the last few
frames across so any residue at the seam is invisible. Then it encodes the
two shipped widths with a 5-frame GOP (scrubbing must land on a real frame),
writes the poster from the new frame 0, and a VP9 copy for headless tests.

Prints the approach length in seconds: every time on the site shifts by it.
"""
import json, re, subprocess, sys, tempfile
from pathlib import Path

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
approach, take, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
BLEND = 0.2  # seconds of cross-blend at the seam


def run(*args):
    return subprocess.run([FF, '-hide_banner', *args], capture_output=True, text=True)


def probe(p):
    err = run('-i', str(p)).stderr
    fps = float(re.search(r'(\d+(?:\.\d+)?) fps', err).group(1))
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err).groups()
    w, hh = map(int, re.search(r', (\d{3,5})x(\d{3,5})', err).groups())
    return fps, int(h) * 3600 + int(m) * 60 + float(s), (w, hh)


def ssim(a, b):
    err = run('-i', str(a), '-i', str(b), '-lavfi', '[0:v]scale=480:270[x];[1:v]scale=480:270[y];[x][y]ssim', '-f', 'null', '-').stderr
    return float(re.search(r'All:([\d.]+)', err).group(1))


def mean_rgb(p):
    raw = subprocess.run([FF, '-v', 'error', '-i', str(p), '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    return list(raw[:3])


a_fps, a_dur, a_size = probe(approach)
t_fps, t_dur, t_size = probe(take)
tmp = Path(tempfile.mkdtemp())

# 1. The take's frame 0, and the approach's last 2.5 seconds, frame by frame.
ref = tmp / 'ref.png'
run('-y', '-i', str(take), '-frames:v', '1', str(ref))
start = max(0.0, a_dur - 2.5)
run('-y', '-ss', f'{start:.3f}', '-i', str(approach), '-vsync', '0', str(tmp / 'c%04d.png'))
cands = sorted(tmp.glob('c*.png'))
scores = [(ssim(c, ref), i) for i, c in enumerate(cands)]
best_score, best_i = max(scores)
cut = start + best_i / a_fps  # the approach ends here; the take's frame 0 takes its place

# 2. Colour: the model may drift a little in exposure or white balance by the end.
got, want = mean_rgb(cands[best_i]), mean_rgb(ref)
gain = [w / g if g else 1.0 for w, g in zip(want, got)]
colour = 'colorchannelmixer=rr={:.4f}:gg={:.4f}:bb={:.4f}'.format(*gain) if max(abs(x - 1) for x in gain) > 0.015 else 'null'

# 3. The master: approach up to the cut, blended into the take, 30 fps, 1920x1080.
master = out / 'tour-master.mp4'
offset = max(0.0, cut - BLEND)
fc = (
    f'[0:v]trim=end={cut:.4f},setpts=PTS-STARTPTS,fps={t_fps:g},scale={t_size[0]}:{t_size[1]},{colour},format=yuv420p,settb=AVTB[a];'
    f'[1:v]fps={t_fps:g},scale={t_size[0]}:{t_size[1]},format=yuv420p,settb=AVTB[b];'
    f'[a][b]xfade=transition=fade:duration={BLEND}:offset={offset:.4f}[v]'
)
r = run('-y', '-i', str(approach), '-i', str(take), '-filter_complex', fc, '-map', '[v]', '-an',
        '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv420p', str(master))
if r.returncode:
    sys.exit(r.stderr[-2000:])
m_fps, m_dur, _ = probe(master)

# 4. The shipped widths, GOP 5.
for width, crf in ((1440, 30), (960, 32)):
    r = run('-y', '-i', str(master), '-vf', f'scale={width}:-2', '-an', '-c:v', 'libx264', '-profile:v', 'high',
            '-pix_fmt', 'yuv420p', '-crf', str(crf), '-g', '5', '-keyint_min', '5', '-sc_threshold', '0',
            '-preset', 'slow', '-movflags', '+faststart', str(out / f'tour-{width}.mp4'))
    if r.returncode:
        sys.exit(r.stderr[-2000:])

# 5. Poster (the new frame 0) and the VP9 copy the headless checks scrub.
run('-y', '-i', str(master), '-frames:v', '1', '-vf', 'scale=1344:-2', str(out / 'tour-poster.webp'))
run('-y', '-i', str(out / 'tour-960.mp4'), '-an', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0', '-g', '5', str(out / 'tour-test.webm'))

# The approach as it appears in the master: up to the cut, less the blend the take absorbs.
lead = offset
print(json.dumps({
    'approach': {'fps': a_fps, 'duration': round(a_dur, 3), 'size': a_size},
    'seam': {'cut_s': round(cut, 3), 'ssim': round(best_score, 4), 'ssim_all_tail': [round(s, 4) for s, _ in scores[-8:]],
             'colour_gain': [round(g, 4) for g in gain], 'colour_applied': colour != 'null'},
    'master': {'fps': m_fps, 'duration': round(m_dur, 3)},
    'lead_s': round(lead, 3),
    'sizes_kb': {p.name: p.stat().st_size // 1024 for p in out.glob('tour-*')},
}, indent=1))
