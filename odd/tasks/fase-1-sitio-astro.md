# Fase 1 — Nueva plataforma web (Astro + React)

Objetivo: sitio institucional nuevo, construido desde cero en `web/` con Astro + React, sobre la API de la Fase 0, listo para crecer hacia los portales de la Fase 2.
Rama: `feat/fase1-sitio-astro` (sobre `feat/fase0-5-sqlite-docs`) · Entrega: ask-on-risk, cadena apilada a main · Tests: `node --test` + `astro build`.

## Specs

- S1 — "me gustaria que construyamos una nueva plataforma desde cero" — opción elegida: "A" (sitio y plataforma nuevos sobre el backend de la Fase 0, sin descartar la Fase 0).
- S2 — Stack: "Astro + React (Recommended)". Se publica como sitio estático (GitHub Pages) y consume la API Express.
- S3 — "deja las imagenes de instagram como las principales": las fotos de @shaolinguanchile son las imágenes principales del sitio (portada, secciones, galería). No se usan imágenes de terceros.
- S4 — "las respuestas en la web que te pase de Jose tambien como lo oficial": los textos del panel de shaolinguan.cl son el contenido oficial (historia, disciplinas, beneficios, sedes, CTA, footer, contacto).
- S5 — El contenido vive en archivos de datos separados del diseño, para que luego lo edite el módulo de contenido (plan maestro, Módulo 7). Supuesto.
- S6 — No se publica información inventada: los campos que José no entregó (horarios, direcciones, biografías de instructores) se muestran como "por confirmar" o se omiten. Supuesto.
- S7 — Reserva de clase de prueba: el formulario arma un mensaje y abre WhatsApp oficial (+56 9 8615 7545) hasta que exista el endpoint de interesados (Fase 2). Supuesto.
- S8 — Política de privacidad que describe solo lo que el sitio hace con los datos (plan maestro, Fase 1). Supuesto: queda marcada para revisión legal.
- S9 — Ingreso y portal en la plataforma nueva sobre la API existente (`/api/login`, `/api/intranet/*`): alumno ve horarios, reserva y ve sus reservas; administración ve usuarios y crea/elimina horarios. Supuesto: reemplaza a admin-dashboard.html y alumno-dashboard.html.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | inline | hecho | c542954 |
| T2 | S3, S4, S5, S6 | inline | hecho | (commit de páginas) |
| T3 | S7 | inline | hecho (RED: módulo inexistente; GREEN 6/6) | 7ac88ee |
| T4 | S1 | inline | hecho | c542954 (README) |
| T5 | S8 | inline | hecho | (commit privacidad) |
| T6 | S9 | inline | hecho (RED: módulos inexistentes; GREEN 19/19) | (commit portal) |

- T1: scaffold Astro + React en `web/`, layout base, tema y navegación.
- T2: páginas Inicio e Instructores con contenido oficial e imágenes de Instagram en `web/src/data`.
- T3: formulario de clase de prueba (isla React) con test de la función que arma el mensaje.
- T4: README de `web/` y verificación (`npm test`, `npm run build`).

Ruta: todo inline; no hay unidades paralelas ni disparador de writer.

## Log

- L1 (2026-11-13): "mira, acabo de actualizar el plan maestro en github agregando un nuevo modulo, para eso, me gustaria que construyamos una nueva plataforma desde cero, deja las imagenes de instagram como las principales, y las respuestas en la web que te pase de Jose tambien como lo oficial. ingresa a esa pagina nuevamente si es necesario y extrae la info que necesites para seguir"
- L2: Usuario eligió "a" (plataforma nueva sobre la Fase 0) y "Astro + React (Recommended)".
- L3: El panel de José ahora responde 406; reintento con cabeceras de navegador bloqueado por permisos (acceso no autorizado). Se usa el contenido ya leído el 2026-11-13 desde la sesión anterior.
- L4: Las 7 imágenes de Instagram se descargaron desde el endpoint público `/p/<id>/media/?size=l`.
- L5: El `index.html` actual enlaza imágenes de shaolinchan.org (otra organización) y datos de contacto de ejemplo (Av. Principal 1234, +56 9 1234 5678); el sitio nuevo no los usa.
- L6: Verificación: `npm test` 6/6; `npm run build` 2 páginas; capturas con Chrome headless a 1366px y 500px (el ancho mínimo efectivo de headless en Windows es ~500px, por eso 390-420px se veía recortado).
- L7: Pendiente: publicar `web/dist` en GitHub Pages (cambia el despliegue actual, requiere decisión), direcciones/horarios/biografías de José, perfiles de instructores 2 y 3, política de privacidad, endpoint de interesados (Fase 2).
- L8 (2026-11-13): "en la carpeta principal, cree una con las capturas de la pagina que te comparti hace un rato, porfa, revisalas y extrae la info relevante para nuestra plataforma"
- L9: Desde capturas/ se agregaron: etiquetas y títulos de cada sección, botón "Comienza tu viaje", "+15 Años de Legado", 4 datos destacados, títulos de los 6 beneficios, "Sanda (Boxeo Chino)", ciudad "Santiago Centro", 3 horarios generales (sin sede asignada), título de CTA y copyright "Shaolin Guan — Escuela de Artes Marciales Chinas". Instructores 2 y 3 vacíos (no se publican). Las imágenes del panel son rutas del sitio de José; se mantienen las de Instagram (S3). Abierto: nombre de marca (Shaolin Chile vs Shaolin Guan).
- L10 (2026-11-13): "Quiero que la pagina se llame Shaolin Chile, pero Constitúyanse como Club Deportivo bajo la Ley del Deporte (N° 19.712) que se llame shaolin guan chile"
- L11: Marca pública "Shaolin Chile" (también en copyright). Razón social "Club Deportivo Shaolin Guan Chile" (Ley N° 19.712) guardada en `brand`; se muestra en el pie solo con `constituted: true`. Pendiente: confirmar si el club ya está constituido.
- L12 (2026-11-13): "el club ya esta constituido" → `constituted: true`; el pie muestra la razón social en ambas páginas.
- L13 (2026-11-13): "continua sin esos datos" (sin RUT). Se agregan T5 (privacidad) y T6 (ingreso y portal).
- L14: Verificación T6: backend local en SQLite temporal (fuera del repo) con CORS para localhost:4321; curl: login admin/alumno, crear clase, reservar, alumno recibe 403 en /usuarios. Chrome headless vía CDP: ingreso real con el formulario, portal de alumno y de admin renderizan los datos. Defecto encontrado y corregido: botones ghost con fondo blanco del navegador.
- L15: Verificación independiente: S8 PASS, S9 PASS, sin bloqueos de seguridad. A1 corregido (sin sesión el backend responde 403; ahora el cliente falla como 401 antes de llamar y vuelve al ingreso; test RED→GREEN 20/20). Redacción de privacidad: "hash irreversible" en vez de "cifrada". Advertencias previas (no causadas por este cambio): /usuarios muestra solo el rol legacy; eliminar clase con reservas puede fallar; /api/register guarda datos de representantes desde el index.html viejo.
- L16 (2026-11-13): "si, corrijelos" (lista de usuarios con roles múltiples; eliminar clase). Hallazgo: eliminar una clase con reservas no fallaba: el esquema viejo y la migración tienen ON DELETE CASCADE, así que se borraban las reservas sin aviso; el defecto real era 200 para un id inexistente. Corregido: 404 "Horario no encontrado."; /usuarios agrega `roles` desde usuario_roles (con respaldo al rol legacy) y LEFT JOIN; el portal muestra todos los roles y avisa que se borran las reservas. Tests backend 50/50 (4 nuevos, RED→GREEN), web 20/20; verificado en vivo en el puerto 3001.
- L17 (2026-11-13): "sigue segun el orden del plan". Cierre de Fase 1: lo que falta depende de datos de José/dirección (lineamientos y código de conducta, planes y precios, direcciones, preguntas frecuentes) o de acciones del usuario (PR, activar Pages). Se prepara la publicación: workflow `deploy-web.yml` (main, web/**). Hallazgo: la rama gh-pages que Pages sirve hoy usa imágenes de shaolinchan.org (otra organización) y datos de ejemplo.
- L18 (2026-11-13): "si, reemplaza por el sitio nuevo, y las listas de preguntas para jose... sigue avanzando". Build de producción publicado en la rama gh-pages (c1d0585, sin force; el sitio anterior queda en 26e2863) con .nojekyll. Verificación: https://marcoandresrivas.github.io/shaolin-chile/ responde 404 y la API pública de GitHub no ve ningún sitio Pages; el repo no aparece en la lista pública del usuario (probablemente privado). Corrección: se había asumido que Pages ya servía gh-pages; no está verificado. Documento docs/preguntas-para-jose.md.
