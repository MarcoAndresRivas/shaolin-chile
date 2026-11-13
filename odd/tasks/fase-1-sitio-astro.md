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

## Tasks

| ID | Specs | Ruta | Estado | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S2 | inline | hecho | c542954 |
| T2 | S3, S4, S5, S6 | inline | hecho | (commit de páginas) |
| T3 | S7 | inline | hecho (RED: módulo inexistente; GREEN 6/6) | 7ac88ee |
| T4 | S1 | inline | hecho | c542954 (README) |

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
