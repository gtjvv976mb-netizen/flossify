// The owner's machine keeps its settings in .env. `astro dev` and
// `astro preview` hand .env to the app only through import.meta.env, and
// Astro writes import.meta.env.X into the build as a literal, so a setting
// read that way is the build machine's, not the server's (measured: a build
// on the Mac carried its DATABASE_URL and SESSION_SECRET in dist/server).
// Settings are therefore read from process.env only, and this puts .env
// there, once, before anything reads it. Import it first in every module
// that reads a setting when it loads.
//
// It never overrides a variable the process already has, so a server's own
// environment always wins; and a server with no .env file (the Docker image
// leaves it out) is untouched.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env here: the environment is the configuration */
}
