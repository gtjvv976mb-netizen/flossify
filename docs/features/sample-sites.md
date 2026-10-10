# Sample client sites

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## Sample client sites — `public/samples/`

`public/samples/swiftcare/` is a self-contained clinic website (plain HTML, CSS
and JS, no build step) that shows the site-building service. It is framed on
`/websites/` and served as-is, so it is exactly the folder a clinic would
receive.

It is a **concept redesign of a real clinic's site** — SwiftCare Dental Clinic,
Tarlac City (swiftcaredental.com) — made with the clinic's public branding,
photographs and price list at the owner's direction. Its Book and Staff links
open the clinic's real booking flow and staff login. If that relationship ever
changes, swap the folder for a fictional clinic rather than editing it in place.

It is a **client deliverable, not a Flossify page**, and it deliberately does
not follow Flossify's own design system above: a patient expects a clinic site to feel warm,
so the sample is rounded, shadowed and set in a serif, in the clinic's own gold
and espresso. Keep that exception inside the folder. Its CSS is scoped to its
own document and imports nothing from `global.css`. The clinic's service
photographs are its own stock images and some show people; the no-faces rule
governs Flossify's imagery, not a client's.

Rules that still hold there:

- **No third-party fonts or scripts.** Fraunces and Plus Jakarta Sans are
  self-hosted in `assets/fonts/` (latin subset, variable). The one embed is the
  Google Maps iframe in the contact section, lazy-loaded.
- **`noindex`, and labelled as a concept** in the top bar, footer and on
  `/websites/`, so it never competes with or passes for the clinic's live site.
- Health copy (first aid, aftercare, the Smile Finder) is general guidance and
  says so on the page. A dentist reviews it before any real client ships.
- Content lives in `js/data.js`; the palette is the token block at the top of
  `css/styles.css`. Its animations run for everyone too: `reduceMotion` in
  `js/app.js` is a constant `false` (kept rather than deleted at twenty call
  sites) and the stylesheet has no reduced-motion block.
