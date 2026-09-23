# For hosts that read a Procfile (Heroku-style). docs/deploy.md has the rest:
# set HOST=0.0.0.0 and every variable there. Prefer the Dockerfile where the
# host offers it: a buildpack builds with your variables present, and Astro
# then writes their values into dist/, so a changed secret needs a rebuild.
web: npm start
worker: npm run sms:worker
release: npm run db:migrate
