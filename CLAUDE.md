# Flossify

Marketing site + prototype clinic workspace for dental practice software aimed at
Philippine clinics. Astro 7 (static), Tailwind v4 via `@tailwindcss/vite`.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build
npm run preview
```

---

## Standing constraints

These came from the owner over many rounds and reversing any of them undoes
work that was already rejected once. Do not quietly relax them.

- **No 3D models.** A Three.js scene was built and deliberately removed.
- **No human faces** in any image. Equipment, teeth, braces, tools, empty rooms.
  Three photographs were deleted for containing people.
- **No tooth chart on the home page.** The odontogram lives on the patient
  record only, and was removed from the home page twice.
- **No invented clinic branding and no third-party brand marks in imagery.**
  Two generated shots were thrown away for lettering a fictional clinic name on
  a wall and for a real autoclave manufacturer's logo.
- The site is judged on **user experience and user-friendliness**, for **both
  patients and clinic owners**.

## Art direction — Swiss clinical

Three rules govern everything. Breaking any one collapses the page back into a
generic SaaS template, which is what the owner rejected.

1. **Nothing is rounded.** `border-radius: 0` everywhere.
2. **Nothing casts a shadow.** Separation is 1px rules and whitespace.
3. **Uppercase lives in the mono face alone** (`.meta`, `.sec-no`).

Type is **Archivo** (variable, display + body) and **IBM Plex Mono** (all
metadata), both self-hosted from `public/fonts/`. Do not re-add Google Fonts:
it is a third-party connection on a page about medical records, and it is
blocked outright in some sandboxes, which silently renders everything in
Helvetica.

`src/styles/global.css` is the whole system. Read the comment at the top of the
`@layer components` block before editing it — component rules **must** stay
inside that layer or they beat Tailwind utilities on equal specificity.

## The tour

`#tour` is one continuous 20s take, scrubbed by scroll: `scroll position ->
video.currentTime`. Nothing scales; the forward motion is in the footage. See
`docs/generation.md` for how the film was made and how to regenerate it.

- Encoded with a **5-frame GOP** so scrubbing lands on a real frame. This is why
  the files are larger than a streaming encode, and why **VP9 loses** here — it
  was measured at 5.05MB against H.264's 4.77MB at worse quality. Ship H.264.
- Phones get `tour-960.mp4`; `prefers-reduced-motion` gets **no `src` at all**,
  so the film is never downloaded for someone who will not see it.

## Verification — measure, do not eyeball

Every bug that cost real time in this project was invisible in the markup and
invisible in a glance. Screenshots are for judging design; numbers are for
judging correctness.

- Read back `getBoundingClientRect()` after layout changes.
- Sample computed colours and compute contrast ratios; do not judge by eye.
  Small mono text is 12px, so it needs **4.5:1**, not 3:1.
- For video, extract real frames with ffmpeg and measure against those.
- Check `prefers-reduced-motion`, keyboard order, and 390px width every time.

## Traps already hit

- **`@layer components`** — unlayered, `.media { position: relative }` beat an
  `absolute` utility and parked the hero photo at intrinsic size in a corner.
- **`.gitignore` anchoring** — a bare `shots/` also matched `public/shots/`, so
  the screenshots the home page depends on were silently untracked. Anchor
  repo-root-only ignores with a leading slash.
- **Minified template literals** — the bundler emits `` `/video/x.mp4` ``.
  Path-rewriting that only handles `"` and `'` misses it and 404s the film.
- **CSS asset URLs are absolute and unquoted** — `url(/fonts/x.woff2)`. Rewriting
  the HTML is not enough; rewrite the stylesheet too.
- **Headless Chromium has no H.264**, so the shipped MP4 cannot be played in it.
  Verify the scrub mechanism with a VP9 copy and the visuals from decoded frames.
- **Screenshot selectors** — the first `<table>` on the workspace is HMO claims,
  not the day queue. Pin captures to heading text (`scripts/shoot.mjs`).
- Do not `pkill -f 'astro preview'`; it kills the agent's own shell. Use a new
  port instead.

## Open — read before shipping

**The clinic workspace has no authentication.** `/c/[clinic]/patients/` exposes
patient records to anyone who guesses a clinic slug. Under the Data Privacy Act
of 2012 that is a reportable breach, not a rough edge. `src/data/schema.sql`
already defines forced row-level security keyed on `app.clinic_id`; the missing
piece is login and session handling that sets it. Keep the prototype banner on
every workspace page until that exists.

## Layout

```
src/pages/index.astro          the marketing page (tour, product, services, FAQ)
src/pages/clinics.astro        workspace directory
src/pages/c/[clinic]/…         prototype clinic workspace
src/components/Odontogram.astro  32 teeth, FDI/Universal/Palmer, surface-scoped
src/data/schema.sql            full multi-tenant Postgres model with RLS
src/data/lqip.json             blur placeholders, keyed by image name
src/data/shot-size.json        real screenshot dimensions (generated)
public/video/                  the tour film + poster
```

`lqip.json` and `shot-size.json` are generated. Regenerate them whenever the
images or screenshots change, or the reserved boxes drift out of step.
