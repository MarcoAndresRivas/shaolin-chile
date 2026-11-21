#!/bin/sh
# Container start: prepare the database (schema and optional demo data), then
# run the API.
set -e
sh scripts/prepare-db.sh
exec node index.js
