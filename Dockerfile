# Flossify: one image for everything that runs on the server.
#
#   docker build -t flossify .
#   web        docker run -p 8080:8080 --env-file prod.env -v flossify-data:/data flossify
#   worker     docker run --env-file prod.env flossify npm run sms:worker
#   release    docker run --env-file prod.env flossify npm run db:migrate   (before each new web version)
#   backup     docker run --env-file prod.env -v flossify-data:/data flossify npm run db:backup
#
# docs/deploy.md is the whole procedure. What this file is careful about:
#
# 1. No settings at build time. Astro writes the value of every
#    import.meta.env.X that server code reads into dist/ when it builds, from
#    .env and from the build's own environment (measured: a build on the Mac
#    carried its DATABASE_URL and SESSION_SECRET in dist/server/chunks).
#    .dockerignore keeps .env out of the context and nothing in the build
#    stage sets a setting, so this build carries none; the server reads them
#    from the host when it runs. Do not add an ARG or ENV for a setting to the
#    build stage: some hosts (Render, Railway) pass every variable in as a
#    build argument, and an ARG with its name is what lets it in.
#
# 2. Only production dependencies in the image. playwright, ffmpeg-static and
#    @gltf-transform/cli are devDependencies and stay in the build stage. The
#    build stage installs with --ignore-scripts so ffmpeg-static does not
#    download ffmpeg from GitHub for a build that never uses it (esbuild and
#    the other native tools find their platform packages without scripts).
#    The runtime stage runs npm ci --omit=dev inside the image, so sharp gets
#    the prebuilt linux binaries for the machine that builds it: the lockfile
#    carries @img/sharp-linux-x64 and @img/sharp-linux-arm64 (glibc), which is
#    what this Debian base needs on amd64 and arm64.
#
# 3. PostgreSQL 17 client tools are installed (pg_dump, pg_restore, psql).
#    npm run db:backup needs pg_dump, whose major version must be at least the
#    server's; Debian trixie ships 17, the version Flossify is developed on.
#    Having them here means a backup or a restore can run from this same image,
#    in the web service's shell where the photos are, with nothing else to
#    install. Cost: roughly 20 MB. If the database is ever moved to
#    PostgreSQL 18, pg_dump 17 will refuse it: install a newer client then.
#
# 4. The processes run as the unprivileged user `node`, never as root. Hosts
#    mount persistent disks owned by root, which `node` could not write to, so
#    the container starts as root only long enough for flossify-entrypoint
#    (below) to create UPLOAD_DIR and BACKUP_DIR and hand them to `node`,
#    then runs the command as `node` through gosu. tini is PID 1, so SIGTERM
#    reaches npm and the server or worker stops cleanly on a redeploy.
#    A host whose start command replaces the ENTRYPOINT (Railway does) should
#    start with `flossify-entrypoint`, e.g. `flossify-entrypoint npm run sms:worker`.

# --- Build ---------------------------------------------------------------------
FROM node:24-trixie-slim AS build
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# The one build-time input, and not a secret: extra host names that form posts
# are accepted on behind the proxy (astro.config.mjs), e.g. the platform's own
# address while DNS still points elsewhere. Unset, only flossify.ph and www.
ARG EXTRA_HOSTS=
RUN EXTRA_HOSTS="$EXTRA_HOSTS" npm run build

# --- Runtime -------------------------------------------------------------------
FROM node:24-trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 gosu tini ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The built site. The server finds dist/client relative to dist/server/entry.mjs.
COPY --from=build /app/dist ./dist
# What the scripts read at run time: db:migrate reads src/data/schema.sql and
# src/data/migrations/; the text worker imports src/lib/sms.ts. src/lib and
# src/data are copied whole so a script that imports another file there works.
COPY src/lib ./src/lib
COPY src/data ./src/data
COPY scripts/sms ./scripts/sms
# setup.sh and seed.ts are left out on purpose: they drop and fill a
# development database and must never run against a real one.
COPY scripts/db/migrate.ts scripts/db/backup.sh scripts/db/admin-create.ts ./scripts/db/

RUN mkdir -p /data/uploads /data/backups \
 && chown -R node:node /data \
 && printf '%s\n' \
    '#!/bin/sh' \
    'set -e' \
    'if [ "$(id -u)" = 0 ]; then' \
    '  for d in "${UPLOAD_DIR:-/data/uploads}" "${BACKUP_DIR:-/data/backups}"; do' \
    '    mkdir -p "$d" 2>/dev/null || true' \
    '    if [ -d "$d" ] && [ "$(stat -c %U "$d")" != node ]; then' \
    '      chown -R node:node "$d" || echo "flossify-entrypoint: could not give $d to the node user; writing there will fail" >&2' \
    '    fi' \
    '  done' \
    '  exec gosu node "$@"' \
    'fi' \
    'exec "$@"' \
    > /usr/local/bin/flossify-entrypoint \
 && chmod 755 /usr/local/bin/flossify-entrypoint

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/flossify-entrypoint"]
CMD ["npm", "start"]
