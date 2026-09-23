# How the imagery was made

Everything in `public/img/` and `public/video/` is generated. This file records
the method so it can be extended or regenerated without rediscovering it.

Tooling: the **Higgsfield** MCP server (`generate_image`, `generate_video`,
`jobs_wait`). It is connected per Claude account, so a new account has to
connect it again before any of this can be re-run. Preflight every job with
`get_cost: true` — a cost was once assumed instead of checked and the balance
went from 53 credits to 3.

## House style

Every still shares one clause. Keeping it verbatim is what makes the set read
as one building rather than a stock library.

> Photographed on a full-frame camera with a 24mm lens at f/5.6, camera height
> 1.6m, natural north-facing daylight, neutral white balance, no HDR, no CGI
> look, subtle 35mm film grain, verticals kept perfectly straight. Materials:
> pale white-oak veneer, matte chalk-white lacquer, brushed stainless steel,
> honed grey terrazzo floor, sage-grey upholstery, clear glass. No text, no
> lettering, no logos, no brand names anywhere. Absolutely no people, no faces,
> no hands anywhere in frame.

The last two sentences are not optional. Without them the model writes a
fictional clinic name on the wall, puts a real manufacturer's logo on the
autoclave, and seats a receptionist in shot.

Model: `gpt_image_2_5`, 1 credit per image, native 1024x688 (3:2) or 688x1024
(2:3) or 1344x752 (16:9). Its upscaler (`upscale_image`) failed 7 of 9 attempts
and is not worth relying on — size the layout to the native pixels instead.

## The tour film

**This is the part that went wrong once, so read it before regenerating.**

The first attempt generated five keyframes independently from text and then four
video segments between consecutive pairs. Each keyframe shared a *style* but
never a *floor plan*, and each segment invented its own continuation between two
frames that did not agree. Result: doors, floors and ceiling height changed as
the camera moved. It looked like four buildings.

What works:

1. **One generation, not several.** A single call is a single coherent world with
   nothing to reconcile between segments.
2. **A straight axis.** Turns are where geometry comes apart. The camera travels
   one line and turns only in the last three seconds.
3. **State the floor plan explicitly** in the prompt — desk on the left, blank
   wall left, two oak doors right, window at the end — instead of describing a
   mood and hoping.
4. **Keep the lighting continuous.** The first version walked from a dusk
   exterior into a daylit interior, which broke continuity a second way.

Model `wan3_0`, 16:9, 1080p, `generate_audio: false`, `duration: 20`
(70 credits). It takes `start_image` and `end_image` roles, whose values are the
**job ids** of earlier image generations. Generate `count: 2` and pick.

If the call is refused with a preset recommendation ("IN THE DARK"), resubmit
with `declined_preset_id` set to the id it returned.

### The prompt that produced the shipped take

> ONE continuous unbroken steadicam take, no cuts, no dissolves, no zoom. The
> camera moves forward at a slow constant walking pace along a single straight
> axis, camera height 1.6 metres, holding a level one-point perspective.
>
> The building is ONE small single-storey dental clinic with a FIXED, UNCHANGING
> layout. Moving forward from the entrance: a pale white-oak reception desk
> stands on the LEFT about six metres in; the camera passes it on the right-hand
> side; beyond the desk a straight corridor continues on exactly the same axis;
> the corridor has a blank matte chalk-white wall on the LEFT and two flush pale
> white-oak doors on the RIGHT; a window at the far end of the corridor. Only in
> the final three seconds does the camera turn gently to the right through the
> last open doorway and come to rest facing a sage-grey dental chair beneath a
> slim overhead LED light.
>
> CRITICAL CONSISTENCY: it is the same building and the same floor throughout.
> One continuous honed grey terrazzo floor from the entrance to the treatment
> room, with no thresholds, no change of material, no change of colour or
> pattern. The doors keep exactly the same size, spacing, position and pale
> white-oak finish for the entire shot and never move, multiply, or change
> style. The walls stay matte chalk-white. The ceiling height never changes.
> Nothing about the architecture is rebuilt or re-invented as the camera
> advances; the camera simply travels through a fixed, solid, unchanging space.
>
> Even soft daylight throughout, neutral white balance, no flicker, no change in
> exposure. Photographed on a 24mm lens, shallow but natural depth of field,
> subtle 35mm film grain, verticals kept perfectly straight.
>
> The clinic is completely empty: absolutely no people, no faces, no hands, no
> silhouettes, no reflections of a person in the glass or the floor. No text, no
> lettering, no logos, no signage anywhere.

The `start_image` was a daylight frame looking straight through the open
entrance: desk on the left, corridor receding to a bright window, one-point
perspective. The `end_image` was the treatment room with the chair centred.

### The 30-second take that is shipped now

The second version starts outside, so the first thing a visitor sees is the
clinic itself. Two changes to the method above, both of which held:

1. **Generate the start frame, do not photograph one.** A dead-on exterior in
   exact one-point perspective, with the door open and the interior floor plan
   visible through it, gives the take a straight axis from the first frame.
   `gpt_image_2_5`, 16:9, two variants, 1 credit. Pick the one whose door leaf
   is folded back against the glass and out of the camera's path — the other
   variant had the leaf standing in the centre of the frame.
2. **Ask for 30 seconds and describe the first five.** "For the first five
   seconds the camera approaches the entrance across the honed grey terrazzo
   paving; the two clipped shrubs in white planters pass out of frame on either
   side. It crosses the threshold through the open doorway with no step and no
   change of floor." Then the interior floor plan as before, and the turn in the
   final four seconds. `wan3_0`, 16:9, 1080p, `generate_audio: false`,
   `duration: 30`, `count: 2` — 105 credits, preflighted with `get_cost: true`.
   `start_image` = the generated exterior's job id; `end_image` = the
   house-style treatment-room still (`operatory-1600.webp`, in the git history).
   The call was refused once with the "IN THE DARK" preset recommendation and
   resubmitted with `declined_preset_id`.

Both variants held the vanishing point — the window and its plant — from 0.0s
to 21.6s. They differed at the turn: one variant **dissolved** from the corridor
into the treatment room at about 25.5s (the plant ghosted over the cabinets for
half a second), which is exactly the cut the film must not have. The other
passed through the last doorway as real geometry. Frame sheets show it; playback
does not. Always sheet the turn at one-second intervals before choosing.

Stops for the captions, read off the sheet: outside 0–5s, reception 5–12.5s,
corridor 12.5–24s, chair 24–30s → `from: 0, 0.17, 0.42, 0.8`.

Encoded as below: `tour-1440.mp4` 5.7MB, `tour-960.mp4` 2.4MB, 180 I-frames in
900 (GOP 5 confirmed). Poster is frame 0 at 1344×756.

### Checking it

Drift is invisible across 20 seconds of playback and obvious in a grid:

```bash
node scripts/sheet.mjs raw/take.mp4 raw/sheet.png   # 12 frames, labelled, 2-up
```

Look for a fixed vanishing point. In the shipped take the window at the end of
the corridor — with the same plant in front of it — holds from 0.0s to 13.1s.
That is what makes it read as one building.

### Encoding

```bash
ffmpeg -i take.mp4 -vf scale=1440:-2 -an -c:v libx264 -profile:v high \
  -pix_fmt yuv420p -crf 30 -g 5 -keyint_min 5 -sc_threshold 0 \
  -preset slow -movflags +faststart public/video/tour-1440.mp4
# and scale=960:-2 -crf 32 for tour-960.mp4
```

`-g 5` is the point: scrubbing lands on a real frame instead of the nearest
keyframe. It is also why VP9 loses here (measured 5.05MB vs H.264 4.77MB at
worse quality) — the short GOP costs VP9 far more. Ship H.264 only.

Poster frame is frame 0 at `public/video/tour-poster.webp`.

## Images to WebP

Two widths per photograph, never upscaled past the source, plus a 20px blurred
copy inlined as the figure background so a photo resolves out of its own colours
instead of snapping in over an empty box. `src/data/lqip.json` holds those.

## The exterior approach — the 39.8-second film shipped now (2026-09-23)

The owner asked for the film to open on the clinic **from the street** and
walk inside, then continue as before, and for the exterior to **look like a
real dental clinic**. The interior take was kept exactly; a 10-second approach
was generated to end on its first frame and joined on, uncut.

1. **Pin the join frame.** Frame 0 of the interior take (`take-a.mp4`, the
   1920×1080 source) — the open oak-and-glass entrance dead-on, a box shrub in
   a white planter at each edge — uploaded as media
   `608c653f-f667-4461-a6eb-94bfef779608`.
2. **The building, generated from that frame** (`image_references`), so it is
   the same building: `gpt_image_2_5`, 16:9, two variants, 0.25 credits each.
   Job `e171320b-6ce7-448b-9a17-8934b6488bf1` — the one whose entrance
   proportions (side panels 21/48/21% of its width) were nearest the join
   frame's 25/45/25%.
3. **Make it a dental clinic, where the camera loses it before the join.**
   Four variants from both references (job above + join frame), 0.25 each.
   Every dental cue sits where the approach carries it out of frame before
   the door: a backlit sign high on the façade with a white tooth pictogram
   on a sage-teal face (a symbol, not a brand — no letters anywhere), a
   sage-grey dental chair under an operatory light through the right window,
   frosted privacy film on the left window, an empty slatted oak bench.
   Nothing added near the entrance or the planters, so nothing can morph at
   the join. Chosen: job `175dde09-c6ca-4dff-92a4-15695f3c7f84`
   (`docs/exterior-dental.png`) — its sign is mounted flush under the parapet
   (another variant perched it on the roof edge) and its bench is slatted.
4. **The approach.** `wan3_0`, 16:9, 1080p, `duration: 10`,
   `generate_audio: false`, `enable_thinking: true`, `count: 4`,
   `start_image` = the chosen exterior, `end_image` = the join frame,
   `declined_preset_id: 24bae836-2c4a-48e0-89b6-49fcc0b21612` (the "IN THE
   DARK" preset is suggested for this kind of prompt every time; decline it).
   **140 credits.** `get_cost` ignores `count`: the real price is 3.5 credits
   a second at 1080p *per variant*. Prompt: one continuous steadicam take
   straight along the axis, through the hedge gap, across the forecourt, to
   rest close in front of the open entrance; "ONE building with a FIXED,
   UNCHANGING design"; and the order things leave the frame — pines and
   roofline first, then the tooth sign out of the top, then the windows and
   the bench out of the sides — "naturally, by perspective alone".
5. **Choose by measurement, not by eye.** Last frame against the join frame
   (SSIM at 480×270): 0.933 / 0.934 / 0.925 / **0.621** — the fourth never
   arrived and was dropped. One-second sheets of the other three: one
   building throughout, no dissolve. Frame-to-frame SSIM over all 300
   frames: the worst pair 0.881 / 0.869 / 0.876 — each dip is the fine
   granite paving re-rendering under the moving camera, not the building.
   Chosen `0ce323e6-e664-4fb2-ac43-eb50bbc973e9`: best end match, smoothest
   worst frame.
6. **Join** with `scripts/film-join.py <approach> <take> <out>`: it finds the
   approach frame nearest the take's frame 0 (here the very last one,
   SSIM 0.945, climbing steadily over the final eight frames — the camera
   converges on the door rather than jumping to it), checks colour (within
   0.6% — no correction), blends 0.2s across the seam, and encodes both
   widths, the poster and the VP9 test copy. Frame-to-frame SSIM across the
   seam never drops below 0.964, the same as inside the interior take.
7. **Wire it.** The interior now starts at **9.767s** of a 39.8s film. That
   one number is `LEAD` in `src/data/film.ts`; the home page's rooms
   (`ROOM_FROM`) and the sign-in walk (`SIGNIN_WALK`) are computed from it.

Encoded at crf 30, the same as before, so the interior looks exactly as it
did: `tour-1440.mp4` 9.0MB (was 5.7MB for the interior alone — pines, hedges
and granite are expensive at GOP 5), `tour-960.mp4` 3.9MB. crf 32 would save
1.7MB for a measurable softening (SSIM 0.980 → 0.975 inside, 0.962 → 0.954
outside); not taken.
