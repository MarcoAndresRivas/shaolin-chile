#!/bin/sh
# Container start: bring the database schema up to date, optionally load the
# demo data (SEED_DEMO=true; every seed is safe to repeat), then run the API.
set -e
npx knex migrate:latest --knexfile knexfile.js
if [ "$SEED_DEMO" = "true" ]; then
    node seed_admin.js
    node seed_alumno.js
    node seed_ofertas.js
    node seed_productos.js
    node seed_duanpin.js
fi
exec node index.js
