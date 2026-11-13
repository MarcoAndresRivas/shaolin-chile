Objective: Phase 0 of the master plan (docs/plan-maestro.md, branch docs/plan-maestro): clean up the base before building the platform.
Branch: chore/fase-0-base · Delivery: ask-on-risk · Test runner: node:test (built-in, Node >= 18)

## Specs

- S1 (secrets out of the repo): "El archivo `backend/.env` está subido al repositorio con las credenciales de la base de datos y la clave JWT. Hay que cambiar esas claves en Aiven y Render, sacar el archivo del repositorio y agregar un `.gitignore`." Key rotation in Aiven/Render is a user action.
- S2 (seed passwords): "Los scripts `seed_admin.js`, `seed_alumno.js` y `seed_custom_admins.js` contienen contraseñas escritas en el código. Deben cambiarse y leerse desde variables de entorno."
- S3 (JWT secret required): "Si falta `JWT_SECRET`, el servidor usa una clave por defecto conocida; debe negarse a arrancar."
- S4 (CORS): "CORS acepta cualquier origen; debe limitarse al dominio del sitio."
- S5 (leftover files): "Archivos sobrantes: `push_error.txt`, `seed_error.log` y `representantes.db` (SQLite sin uso, ya que el sistema usa MySQL)."
- S6 (workflow): "El push directo a `main` está bloqueado por reglas del repositorio: el equipo debe trabajar con ramas y pull requests (ver lineamientos)." Plus "definir ramas y flujo de trabajo".
- S7 (migrations and roles): "crear migraciones y la nueva estructura de roles, incluidas familias y consentimientos." Roles per plan: Director, Administrador, Instructor, Encargado de catálogo, Encargado de contenido, Apoderado, Alumno; "el usuario debe poder acumular roles".
- Closing criterion: "ninguna credencial en el repositorio, claves rotadas y la base creada desde migraciones."
- Assumption: `backend/node_modules` is also untracked (generated; Render runs `npm install`).

## Tasks

- [~] T1 · S1, S5 · inline · Repo hygiene: .gitignore, untrack node_modules, delete leftovers, add env.example. Commit 6d34747. Pending: untrack backend/.env (blocked by local permission rules; user runs it).
- [x] T2 · S3, S4 · inline · Config module: fail fast without JWT_SECRET, CORS allowlist; tests. Commit a79e005. Review approved (review-27a3a5df9021948c).
- [x] T3 · S2, S7 · inline · Knex migrations (baseline + usuario_roles + familias + consentimientos) and seeds reading SEED_*_PASSWORD. Commits d2f5195, dc3be58 (review correction: FK signedness), 3c0cb72. Reviews approved (review-58e037377c758098, review-156db5c9c22e6f59).
- [x] T4 · S7 · inline · Auth by roles list; legacy rol_id kept in login response and as fallback. Commits a23327e, a8bcebe.
- [x] T5 · S6 · inline · README + CONTRIBUTING with branch/PR workflow and setup.
- [ ] U1 · S1 · user · Untrack backend/.env; rotate DB password (Aiven), JWT_SECRET (Render) and seeded user passwords; set SEED_* and CORS_ORIGINS.
- [ ] U2 · S7 · user · Run `npm run migrate` against production before deploying this branch's backend.

## Log

- L1 (2026-11-13, user): "Ahora que creo que tenemos los lineamientos establecidos quiero que comiences con la reestructuracion y/o creacion de la plataforma"
- L2: No local MySQL or Docker; migrations are tested on SQLite (knex supports both). Production migration run is a user decision.
- L3: Uncommitted gallery changes (index.html, css/styles.css) belong to feat/galeria-instagram and are never staged on this branch.
- L4: Local permission rules deny any command or file write touching `.env`; env template saved as backend/env.example instead of .env.example.
- L5: Review of T3 found a real blocker: production ids are signed INT, knex increments() is unsigned, so MySQL would reject the new FKs. Fixed with a column-type check (src/db/schemaHelpers.js) and re-runnable steps.
- L6: Evidence: `npm test` 37/37 pass (node:test, SQLite in memory). Not verified against real MySQL (no local server); first run on production is U2.
- L7: Secrets remain in git history even after untracking; rotation (U1) is what closes S1. History rewrite is optional and destructive; not done.
- L8: Open follow-ups (non-blocking review notes): MySQL TLS uses rejectUnauthorized=false (pre-existing; needs Aiven CA cert); createUsuario fails before migrations run (deploy order documented); rollback path of createUsuario untested.
- L9: Next step: assign real people to the new roles (Director, Instructor, etc.) once the user confirms who holds each one.
