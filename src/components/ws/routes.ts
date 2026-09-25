// Where the shell's links go, in one place: the top bar (src/layouts/Clinic.astro)
// and search (src/pages/api/search.ts) both read it.
//
// The shell ships before the pages it points at are rebuilt (docs/workspace-
// redesign.md, "Shell API" → "Contracts"). Until a page has landed, its link
// goes to the page that does the job today, so nothing a clinic can do
// disappears in between. All five have landed now: the Dashboard (bookings,
// the day, the web requests), the Patients tab, Finances, Add patient and My
// page. The flags stay so a page can be switched back while it is being rebuilt.
//
// When a rebuilt page lands, its engineer sets its flag to true (one line),
// and every link to it switches over.
export const LANDED = {
  /**
   * The Dashboard (/c/<slug>/) answers ?new=booking, ?date=YYYY-MM-DD&booking=<uuid>, and has id="requests".
   * On: the Dashboard answers all three, and /schedule/ now redirects to it — so the old
   * link opened the Dashboard with no booking form (+ New → New booking did nothing).
   */
  dashboard: true,
  /**
   * /c/<slug>/patients/ is the Patients tab: every patient of the branch, searched, filtered, sorted, with each
   * record's check. Before it, that address redirected to the Dashboard's patients panel (#patients).
   */
  patients: true,
  /** /c/<slug>/finances/ exists. */
  finances: true,
  /** /c/<slug>/patients/new/ exists. */
  addPatient: true,
  /** /c/<slug>/account/ exists. */
  myPage: true,
};

export interface ShellLinks {
  dashboard: string;
  /** The Patients tab (every patient); the Dashboard's today's patients until it has landed. */
  patients: string;
  /** Import patients from a spreadsheet. */
  importPatients: string;
  finances: string;
  settings: string;
  messages: string;
  claims: string;
  newBooking: string;
  newCharge: string;
  requests: string;
  /** null until the page exists: the link is left out. */
  addPatient: string | null;
  myPage: string | null;
  /** A booking from search: that day, that booking. */
  booking: (ymd: string, id: string) => string;
}

export function shellLinks(slug: string): ShellLinks {
  const b = `/c/${slug}`;
  return {
    dashboard: `${b}/`,
    patients: LANDED.patients ? `${b}/patients/` : `${b}/#patients`,
    importPatients: `${b}/patients/import/`,
    finances: LANDED.finances ? `${b}/finances/` : `${b}/billing/`,
    settings: `${b}/settings/`,
    messages: `${b}/messages/`,
    claims: `${b}/claims/`,
    newBooking: LANDED.dashboard ? `${b}/?new=booking` : `${b}/schedule/`,
    newCharge: `${b}/billing/new/`,
    requests: LANDED.dashboard ? `${b}/#requests` : `${b}/#web-title`,
    addPatient: LANDED.addPatient ? `${b}/patients/new/` : null,
    myPage: LANDED.myPage ? `${b}/account/` : null,
    booking: (ymd, id) => (LANDED.dashboard
      ? `${b}/?date=${ymd}&booking=${encodeURIComponent(id)}`
      : `${b}/schedule/?date=${ymd}`),
  };
}
