// Lets plain Node import the repo's TypeScript libs, whose relative imports have no extension (Vite resolves them).
import { register } from 'node:module';
register('./ts-resolve-hooks.mjs', import.meta.url);
