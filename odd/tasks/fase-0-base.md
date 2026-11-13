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

- [ ] T1 · S1, S5 · inline · Repo hygiene: .gitignore, untrack .env / node_modules / representantes.db, delete leftovers, add .env.example.
- [ ] T2 · S2, S3, S4 · inline · Config module: fail fast without JWT_SECRET, CORS allowlist, seeds read passwords from env; tests.
- [ ] T3 · S7 · inline · Knex migrations: baseline of current tables + roles many-to-many + familias + consentimientos; tests on SQLite.
- [ ] T4 · S7 · inline · Auth and middleware use the roles list (keep `rol_id` in login response for the current frontend).
- [ ] T5 · S6 · inline · README + CONTRIBUTING with branch/PR workflow and setup.
- [ ] U1 · S1 · user · Rotate DB password (Aiven), JWT_SECRET (Render) and seeded user passwords.

## Log

- L1 (2026-11-13, user): "Ahora que creo que tenemos los lineamientos establecidos quiero que comiences con la reestructuracion y/o creacion de la plataforma"
- L2: No local MySQL or Docker; migrations are tested on SQLite (knex supports both). Production migration run is a user decision.
- L3: Uncommitted gallery changes (index.html, css/styles.css) belong to feat/galeria-instagram and are never staged on this branch.
