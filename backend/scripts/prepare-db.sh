#!/bin/sh
# Bring the database schema up to date and, with SEED_DEMO=true, load the demo
# data (every seed is safe to repeat). Used by the container start and by the
# Vercel build.
set -e
npx knex migrate:latest --knexfile knexfile.js
if [ "$SEED_DEMO" = "true" ]; then
    node seed_admin.js
    node seed_alumno.js
    node seed_ofertas.js
    node seed_productos.js
    node seed_duanpin.js
fi
