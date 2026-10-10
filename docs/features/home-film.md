# The home page and its film

*Moved here from `CLAUDE.md` word for word on 10 Oct 2026 (plan item 1.9). `CLAUDE.md` holds the rules; this file holds the detail. Where they differ, `CLAUDE.md` wins.*

## The tour

**The home page's pages** (the owner's layout, 25 Sep 2026), in this order,
all standing on the film (no section numbers any more: after the opening,
each page has a title with a line icon): *Your clinic, in the Web* —
"Switch to paperless, seamless, effortless daily operations:" and the buttons *Open your clinic in the web*
(/start/) and *I'm a Patient* (/find/); Services, for clinics and for
patients; How it works, both ways in; Pricing — ₱800 a month per
branch, everything included (`PRICE_PER_BRANCH` in `src/lib/billing.ts`, the
one number); Partners — the clinics really listed, read live from the
directory (the page is server-rendered for this); How to register — two
walkthroughs recorded from the real product with sample data
(`scripts/record-walkthroughs.mjs`, `public/video/register-*.mp4`); Know
the team — from `src/data/team.ts`, and left out while that list is empty:
real people only, never a placeholder person. The service and price lists
name only what is live (billing, health history and desk consent went in
once they shipped).


The film is the ground of the **whole home page**: one continuous 39.8s film
from the street to the chair in a fixed layer (`.film-bg`) behind everything.
It opens on the clinic building from outside — a white single-storey clinic
with a backlit tooth sign, a dental chair seen through a window, Baguio pines
behind — walks through the hedge gap and across the forecourt, through the
door, and continues as the original 30s interior take. The two shots are
joined on the same frame with no cut (docs/generation.md, "The exterior
approach"); the interior begins at `LEAD` (9.767s) in `src/data/film.ts`,
which is the only place the film's times live. It is
scrubbed by the document's own scroll (`scrollY / (scrollHeight − innerHeight)
→ video.currentTime`). The top of the page is the pavement, the last page is
the chair, and every section between is a `.page` standing in whichever room the
camera has reached, its content on a compact **frosted glass** card
(`.pane.pane-glass`; the owner, 26 Sep 2026: "make the pages in the home page
more compact and make the panels translucent so more of the background can be
seen"). The cards are centred at 1160px so the film shows on both sides, with
compact padding and rows; the footage shows through them (60% white on a 24px
blur; 74% charcoal in dark mode) and in full in the gaps between them. Cards
on the glass are lighter glass with no blur of their own (on a phone the long
lists and steps sit on the bare glass). Because the room shows through, every
line is measured against the pixels actually behind it, over the frame the
film is showing there (light and dark, 1440 and 390, every 110px of scroll,
and over the poster alone): all AA, lowest 4.7:1. So on the glass: ink for
words, ink-2 for small print (never the muted grey), links and the keyboard
ring in the deepest teal (#06403e; the deep teal #0b5d5b fell to 3.5:1 over
the blurred hedges; the pale #98e3dc in dark mode), numbers and checks white on the teal fill; do not make
the glass more transparent without measuring again. Only the home page uses
`.pane` (the other pages stand on `.card` or `.ws-pane`). The owner asked for exactly this — "a video that
shoots all the page" — after a version that kept the film to the opening section. Do not go back to
that. Nothing scales; the forward motion is in the footage. From 1180px the
bar names the page and the room in a small pill beside its links —
"Services · Reception" — the page from the section in view (its `data-sec`),
the room switching at the moments the footage arrives there (`ROOM_FROM` in
`src/data/film.ts`, from times read off a frame sheet), not at equal quarters.

**No footer and nothing fixed at the foot** — on the home page or the staff
entrance. There used to be a readout rail fixed to the bottom of the viewport
and a link footer after the last page; the owner removed both ("the footer
takes too much space … label each page on the site itself"). Pages are
labelled where they are: the bar's readout, each section's own title, and
the "Clinic sign-in" pill at the head of the sign-in card. The footer's links
are in the header nav; the copyright is one line on the last page. Do not put
a footer or a bottom bar back.
See `docs/generation.md` for how the film was made and how to regenerate it.

- Encoded with a **5-frame GOP** so scrubbing lands on a real frame. This is why
  the files are larger than a streaming encode, and why **VP9 loses** here — it
  was measured at 5.05MB against H.264's 4.77MB at worse quality. Ship H.264.
- Phones get `tour-960.mp4`.
- **Nothing on this site is gated by Reduce Motion, and there is no switch.**
  The walk, the rises, the drawn rules, the clipped headlines and the queue
  ticker run for every visitor on every machine. The owner said it twice: the
  first time after a version that gave the film no `src` under Reduce Motion
  (they saw stills), the second — "THE CINEMATIC MOTION SHOULD ALWAYS BE ON,
  ITS NOT AN OPTION" — after a version that still dimmed the autonomous
  motions. `prefers-reduced-motion` blocks, a `force-motion` class and the
  `?motion=on` parameter are all gone from Flossify **and** from the sample
  site. Do not put them back; if accessibility comes up, raise it with the
  owner rather than quietly re-adding a media query.
