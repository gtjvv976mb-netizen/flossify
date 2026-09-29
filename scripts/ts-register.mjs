// node --experimental-strip-types --import ./scripts/ts-register.mjs <script.ts>: run a script that
// imports src/lib/*.ts (npm run consent:hash, npm run test:consent). See ts-hooks.mjs.
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
