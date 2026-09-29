// Module hooks that let plain Node (node --experimental-strip-types) import the app's TypeScript libs,
// whose relative imports carry no extension (Vite resolves them in the build): './health' is tried as
// ./health.ts, then ./health/index.ts. Registered by scripts/ts-register.mjs.
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const url = new URL(specifier, context.parentURL);
    const path = fileURLToPath(url);
    if (!existsSync(path) || statSync(path).isDirectory()) {
      for (const ext of ['.ts', '/index.ts', '.mjs', '.js']) {
        if (existsSync(path + ext)) return next(url.href + ext, context);
      }
    }
  }
  return next(specifier, context);
}
