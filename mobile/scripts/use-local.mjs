// npm run local — points the app in the simulator at a website running on this Mac (npm run dev in the repo's root, port
// 4321) instead of https://flossify.ph, so the website's half of the app (/app/, public/app-shell.js) can be tried before
// it is deployed. It edits only the copy `npx cap sync` puts into the Xcode project (ios/App/App/capacitor.config.json,
// ignored by git); the next `npm run sync` puts flossify.ph back.
//
//   FLOSSIFY_APP_URL=http://localhost:4321/app/ npm run local      (the default address)
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../ios/App/App/capacitor.config.json', import.meta.url);
const url = new URL(process.env.FLOSSIFY_APP_URL || 'http://localhost:4321/app/');
// The app only goes to its bound domains (Info.plist WKAppBoundDomains: flossify.ph, www.flossify.ph, localhost).
if (!['localhost', 'flossify.ph', 'www.flossify.ph'].includes(url.hostname)) {
  throw new Error(`${url.hostname} is not one of the app's bound domains (localhost, flossify.ph): the simulator shares the Mac's localhost`);
}
const config = JSON.parse(readFileSync(file, 'utf8'));
config.server = { ...config.server, url: url.href, allowNavigation: [...new Set([...(config.server?.allowNavigation ?? []), url.hostname])] };
writeFileSync(file, JSON.stringify(config, null, '\t') + '\n');
console.log(`The app now opens ${url.href}. Run the website there (npm run dev), then Run in Xcode. npm run sync puts flossify.ph back.`);
