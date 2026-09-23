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

## The exterior approach — prepared, not yet run (2026-09-23)

The owner asked for the film to open on the clinic building seen from the
street, walk inside, and continue as now. Method, so it joins without a cut:

1. **The join frame is fixed.** Frame 0 of the shipped take (the open
   oak-and-glass entrance, dead-on, a box shrub in a white planter at each
   edge) is uploaded to Higgsfield as media `608c653f-f667-4461-a6eb-94bfef779608`
   and becomes the video's `end_image`. The new shot ends on it; the old take
   starts on it.
2. **The exterior still is generated from that frame** (`image_references`),
   so it is the same building. First draft, job
   `e171320b-6ce7-448b-9a17-8934b6488bf1` (`docs/exterior-draft.png`): a
   single-storey chalk-white flat-roofed clinic, the entrance centred, a tall
   oak-framed window each side, grey slab forecourt, a hedge with a gap on the
   axis, Benguet pines behind. Its entrance proportions (21/48/21%) are the
   closest to the join frame's (25/45/25%).
3. **The owner then asked that it look like a real dental clinic.** Every
   dental cue goes where the camera loses it before the join frame, so the
   join cannot morph: a backlit sign high on the façade above the entrance
   (a white tooth pictogram on a sage-teal face — a symbol, not a brand; no
   letters), a sage-grey dental chair and operatory light seen through the
   right window, frosted privacy film on the left window, an empty oak bench
   beneath it. Nothing added near the entrance or the planters.

Prompt for step 3 (`gpt_image_2_5`, 16:9, `count: 2`, 0.25 credits each;
`image_references`: the draft job id, then the join-frame media id):

> Image 1 is this dental clinic seen from its forecourt; image 2 is its
> entrance seen close up. Keep the SAME building, the same camera position,
> framing and dead-on one-point perspective as image 1: the same flat-roofed
> single-storey chalk-white building, the same pale white-oak framed glass
> entrance exactly in the centre with its single door leaf standing open to
> the left, the same two round clipped box shrubs in white cylindrical planters
> beside it, the same grey stone forecourt, the same hedge with the gap on the
> axis of the door, the same pine trees and hills behind. Leave the entrance
> and the two planters exactly as they are. Make it unmistakably a real,
> working dental clinic, with these additions only: (1) a square backlit sign
> mounted high on the white façade, centred above the entrance: a soft
> sage-teal face with a single simple white tooth pictogram (a molar outline)
> and nothing else on it; (2) the right-hand window shows, through clear glass,
> an empty treatment room with a sage-grey dental chair and a slim overhead
> operatory light; (3) the left-hand window has frosted privacy film on its
> lower two thirds, clear glass above; (4) an empty pale-oak slatted bench
> stands against the wall beneath the left-hand window. The sign carries only
> the tooth symbol: no letters, no words, no name, no numbers anywhere.
> [house-style clause, verbatim, plus "No cars, no vehicles."]

4. **The approach video** (`wan3_0`, 16:9, 1080p, `duration: 8`,
   `generate_audio: false`, `enable_thinking: true`, `count: 1`,
   `declined_preset_id: 24bae836-2c4a-48e0-89b6-49fcc0b21612` because the
   "IN THE DARK" preset is suggested again): `start_image` = the chosen step-3
   job, `end_image` = `608c653f-…`. **28 credits.** The preflight ignores
   `count`; real price is 3.5 credits a second at 1080p per version.
   Prompt: "ONE continuous unbroken steadicam take … walks straight forward
   … through the gap in the low clipped hedge, crosses the forecourt … comes
   to rest close in front of the open entrance … CRITICAL CONSISTENCY: ONE
   building with a FIXED, UNCHANGING design … As it gets closer, the roofline,
   the sign, the side windows and the pine trees pass naturally out of the top
   and sides of the frame" (full text in the session transcript of 23 Sep).
5. **Joining:** trim the approach to end on its frame that best matches frame
   0 (compare with `ffmpeg -lavfi ssim`), then the shipped take from 0.0s,
   re-encode both widths with GOP 5. New length ≈ 38s; every time in the site
   shifts by the approach length L: stops `from` = (L + 0, 5.1, 12.6, 24) / (L
   + 30), and the sign-in walk's `FROM`/`TO` become L + 2.0 / L + 9.0.

**Blocked on credits.** The account's balance is shared with another project
that spends 17.5 a Kling clip; it reached 0 at 04:14 UTC on 23 Sep before the
video could run. Total still needed: about 28.5 credits.
