# The look: the soft template, everywhere

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9), with cross-references re-pointed to the file that now holds them. `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## Art direction — soft clinical, everywhere

**One look for the whole site, by the owner's decision (26 Sep 2026).** The
workspace was redesigned in a soft template first (the owner had called the
Swiss workspace "hard, angry and dark" next to SwiftCare's "soft, friendly and
accommodating"); after seeing it the owner said: *"I love what you've done!
Now implement this kind of HUD/UI design and template to the whole site."* So
every page — the film home page, /find/ and booking, /dentists/, /coverage/,
/websites/, /privacy/, /start/, /me/, the staff sign-in, the workspace
(/c/<slug>/…) and the operator's page (/admin/) — uses the **soft template**
in `docs/workspace-redesign.md` ("The soft template", "The whole site, soft",
"Site API"). **The Swiss rules are retired** (no radius, no shadow, uppercase
mono labels, Archivo): do not bring them back on any page.

**Frosted glass where a clinic is the background** (the owner, 26 Sep 2026:
"make the panels translucent … so more of the background can be seen"): the
home page's cards on the film (`.pane.pane-glass`, see "The film" in docs/features/home-film.md), the
clinic sign-up `/start/`, whose compact glass cards stand on a fixed photo of
the treatment room (`/img/ws/chair-*.webp`), and Find a clinic `/find/` (the
"I'm a Patient" page; its glass is scoped to `.pt-glass` in the page, over the
waiting area `/img/ws/waiting-*.webp`), PhilHealth & HMO `/coverage/` (over
the reception desk, `/img/ws/reception-*.webp`, scoped to its `cv-*` classes)
and My visits — the door `/me/` and `/me/code/` (`_Door.astro`) and the
signed-in `/me/visits/` (`_Shell.astro`, scoped to `.me-shell` so the clinic
workspace is untouched), over the waiting area. A clinic's own page and its
booking (`find/_ui/ClinicRoom.astro` + `clinic-glass.css`, scoped to
`.cl-glass`) stand on THAT clinic's own cover — its first uploaded photo
(`up:` key), never a house or stock photo, which behind a real clinic's page
would read as its interior — or, with no upload, a soft abstract blur. A
clinic can upload anything, so the room is washed/dimmed enough that every line
passes over an all-black, all-white and harshly striped cover, and
`room-tone.ts` looks at each upload once (cached; never throws) to calm busy or
dark ones further. Clinic websites `/websites/` stands on the clinic's front
door (`/img/signin-door-*.webp`, scoped to `.wb-glass`); the SwiftCare sample in
its window stays an opaque page with its own branding. A dentist's page still
stands on opaque cards. Glass uses the `--glass-*`
tokens in global.css; every line on it is measured against the pixels behind
it (light and dark, 1440 and 390) — measure again before making it clearer.

- **Surfaces:** white cards with gently rounded corners — 12px cards, 16px big
  cards and sheets, 10px fields and buttons, 999px pills and avatars — a
  hairline (`#e6e9ee`) and at most a whisper of shadow. No black buttons, no
  black blocks.
- **Colour:** slate words, never black (`#1f2937`, `#475467`, muted
  `#667085`); one calm **teal** for the main action and the chosen thing (fill
  `#0e7471` under white words, `#0d706d` words); green for money in, amber for
  "needs attention", blue for information, a soft red for "blocked", each
  with a pale tint and its own darker words. Dark mode is soft charcoal
  (`#15191e` page, `#1d232a` cards), never pure black.
- **Type:** one friendly sans — Inter where the device has it, the system's
  own UI face otherwise. **No web font is fetched from anywhere**, and never
  Google Fonts: it is a third-party connection on a page about medical
  records, and it is blocked outright in some sandboxes. IBM Plex Mono
  (self-hosted in `public/fonts/`) only for reference numbers — chart and
  statement numbers, booking refs, a six-digit code. **Sentence case
  everywhere; no uppercase typewriter labels.**
- **Very simple:** one teal button per screen (the public bar's Open your
  clinic goes quiet, `cta="quiet"`, wherever the page has its own teal
  action); line icons (`src/components/ws/Icon.astro`) beside nav items,
  section titles and main actions; round initial avatars for people, a
  clinic's initials in a rounded square; tinted callouts with an icon, in
  plain words.
- **Frames:** public pages have a soft top bar
  (`src/components/site/SiteHeader.astro`; a drawer from the left on phones);
  the workspace a left sidebar with four tabs (Dashboard · Patients ·
  Finances · Clinic settings); My visits (/me/visits/) the workspace's
  sidebar pattern (`src/pages/me/_Shell.astro`), and the way in to it (/me/,
  /me/code/) the patients' bar over one card (`_Door.astro`); the staff
  entrance one white card on the film (`StaffEntrance.astro`).
- **Light or dark is the person's choice** (`src/components/ThemeSwitch.astro`):
  the site follows the device until someone chooses; the choice is
  `localStorage.theme` (`light` | `dark`, none = match the device), applied
  before first paint by the inline script in Base, Clinic and Admin, and it only
  sets `<html data-theme>`. The switch is in the public bar (a round 44px button;
  in the drawer on phones), on the staff entrance, in the workspace, operations
  and My visits sidebars, and My page has Match my device · Light · Dark. So
  **every dark rule needs both twins** — `@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) … }` and `:root[data-theme="dark"] …` — or a
  chosen theme misses it. Measured: on 12 kinds of page, chosen dark = device
  dark and chosen light = device light.
- **Still true everywhere:** motion always on, nothing fixed to the bottom of
  the screen, targets ≥44px, fields ≥16px, and contrast **measured** (≥4.5:1
  against the worst pixel behind the words, light and dark; muted slate on a
  pale tint is 4.48 — use ink-2 or the tint's own ink there).
- **Exceptions:** the SwiftCare sample in `public/samples/` (its own design),
  the paper of print pages (black on white), and the patient record's sheets,
  which are paper on screen too (record.css, "The record on paper").

`src/styles/global.css` is the whole system: the tokens on `:root` (both
themes; the utilities `text-ink`, `bg-teal-tint`, `rounded-card` … read them),
then the site's classes (`.btn`, `.meta`, `.chip`, `.field`, `.pane`, `.q` …,
drawn soft under their old names), the film, the staff entrance, the public
top bar and the workspace. Read the comment at the top of the `@layer
components` block before editing it — component rules **must** stay inside
that layer or they beat Tailwind utilities on equal specificity. The heading
rule is in `@layer base`, so utilities on headings work; the workspace and the
staff entrance keep their own unlayered heading rules, and the workspace must
not change when the site's classes do (compare computed styles before and
after, as the Site API section says).
