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

### Checking it

Drift is invisible across 20 seconds of playback and obvious in a grid:

```bash
node scripts/sheet.mjs raw/take.mp4 raw/sheet.png   # 10 frames, labelled, 2-up
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
