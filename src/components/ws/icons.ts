// The workspace's line icons, as data: the inside of a 24×24 <svg> for each
// name. <Icon name="…"> (Icon.astro) draws them; a script that builds markup
// in the browser can use svgFor(). Hand-written for Flossify — no icon font,
// no third-party request. One icon per idea, the same icon everywhere for it.
export type IconName =
  | 'dashboard' | 'wallet' | 'settings' | 'patients' | 'calendar' | 'plus' | 'search' | 'inbox'
  | 'user' | 'logout' | 'check' | 'alert' | 'info' | 'clock' | 'money' | 'file' | 'upload' | 'download'
  | 'chevron' | 'chevron-right' | 'chevron-left' | 'menu' | 'close' | 'message' | 'clinic' | 'arrow-right';

// Each entry is the inside of a 24×24 <svg>: paths, circles, rects.
export const PATHS: Record<IconName, string> = {
  // four tiles of a board
  dashboard: '<rect x="3.5" y="3.5" width="7" height="8" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.8"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.8"/><rect x="3.5" y="14.5" width="7" height="6" rx="1.8"/>',
  // a wallet with its clasp: Finances
  wallet: '<path d="M18.5 8V7a2 2 0 0 0-2-2H6a2.5 2.5 0 0 0 0 5h13.5a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H6A2.5 2.5 0 0 1 3.5 17V7.5"/><path d="M16.5 14.75h.01"/>',
  // a gear: Clinic settings
  settings: '<path d="M9.89 5.11L10.19 2.67H13.81L14.11 5.11L15.38 5.64L17.31 4.12L19.88 6.69L18.36 8.62L18.89 9.89L21.33 10.19V13.81L18.89 14.11L18.36 15.38L19.88 17.31L17.31 19.88L15.38 18.36L14.11 18.89L13.81 21.33H10.19L9.89 18.89L8.62 18.36L6.69 19.88L4.12 17.31L5.64 15.38L5.11 14.11L2.67 13.81V10.19L5.11 9.89L5.64 8.62L4.12 6.69L6.69 4.12L8.62 5.64Z"/><circle cx="12" cy="12" r="3"/>',
  // two people
  patients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/>',
  // a tray: things waiting
  inbox: '<path d="M3.5 13.5h4.5l1.5 2.5h5l1.5-2.5h4.5"/><path d="M6.2 5.5h11.6l2.7 8V18a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18v-4.5z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  // leaving through a door
  logout: '<path d="M9.5 20.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5h3.5"/><path d="M15.5 16.5L20 12l-4.5-4.5M20 12H9.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  alert: '<path d="M10.3 4.2L2.9 17.3A2 2 0 0 0 4.6 20.3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  // a banknote
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  upload: '<path d="M12 15V4.5M7.5 9L12 4.5 16.5 9"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4.5V15M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  chevron: '<path d="M6.5 9.5L12 15l5.5-5.5"/>',
  'chevron-right': '<path d="M9.5 6.5L15 12l-5.5 5.5"/>',
  'chevron-left': '<path d="M14.5 6.5L9 12l5.5 5.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  // a speech bubble: texts
  message: '<path d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5v-3.5h-1A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5z"/>',
  // a clinic front: a roof, a door, a cross
  clinic: '<path d="M3.5 10.5L12 4l8.5 6.5"/><path d="M5.5 9v11.5h13V9"/><path d="M12 10.5v5M9.5 13h5"/>',
  'arrow-right': '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
};

/** The whole <svg> for a name, for markup built in the browser (decorative: aria-hidden). */
export function svgFor(name: IconName, size = 18): string {
  return `<svg class="ws-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
