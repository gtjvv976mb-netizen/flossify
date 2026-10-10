// Entities and a doctype in strings with no other markup: a script's innerHTML, a service worker's offline page,
// and a character reference past Unicode's last code point (read as U+FFFD, as a browser shows it; never a crash).
export function fill(el: HTMLElement) {
  el.innerHTML = 'No&nbsp;show &middot; call them back';
  return '<!doctype html><title>Offline</title><p>Your appointments are kept on this device.</p>';
}
export const odd = 'Owes &#x110000; on the account';
