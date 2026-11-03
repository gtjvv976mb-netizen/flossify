// node mobile/scripts/draw-icons.mjs — writes the app icon and the launch screens into the Xcode project. Run it again after
// changing the mark (src/styles/global.css .ws-mark-sq: the teal fill, the white glyph). Uses mobile/node_modules (sharp).
// Draws the app icon and the launch screen from the Flossify mark (the workspace's .ws-mark-sq: teal square, white glyph).
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
const GLYPH = 'M9 8h14v11c0 3-1.6 5-3.2 5S17 22.4 17 20.4v-2.2h-2v2.2c0 2-1.2 3.6-2.8 3.6S9 22 9 19z';
const out = new URL('../ios/App/App/Assets.xcassets/', import.meta.url).pathname;
const ICON = out + 'AppIcon.appiconset/';
const SPLASH = out + 'Splash.imageset/';
// The icon: full-bleed teal (iOS rounds the corners itself), the glyph centred at about 56% of the square. No alpha.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#0e7471"/>
  <g transform="translate(512 528) scale(36) translate(-16 -16)"><path d="${GLYPH}" fill="#ffffff"/></g></svg>`;
await sharp(Buffer.from(icon)).flatten({ background: '#0e7471' }).removeAlpha().png().toFile(`${ICON}AppIcon-512@2x.png`);
// The launch screen: the page colour with the rounded mark in the middle (light and dark), 2732 square, aspect-fill.
const splash = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1366 1366) scale(7.5) translate(-16 -16)"><rect width="32" height="32" rx="9" fill="#0e7471"/><path d="${GLYPH}" fill="#ffffff"/></g></svg>`;
await sharp(Buffer.from(splash('#f3f5f8'))).png().toFile(`${SPLASH}splash-light.png`);
await sharp(Buffer.from(splash('#15191e'))).png().toFile(`${SPLASH}splash-dark.png`);
console.log('drawn');
