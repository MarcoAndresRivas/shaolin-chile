# Fase 2 — Portales de alumno, instructor y administración

Objetivo: operar una sede piloto en la plataforma, siguiendo el plan maestro (`docs/plan-maestro.md`, rama `docs/plan-maestro`).
Rama: `feat/fase2-clases` (sobre `feat/fase1-sitio-astro`) · Entrega: cadena apilada a main, un PR por tarea · Tests: `npm test` en `backend/` y `web/`.

## Specs

- S1 — "Fase 2 — Portales de alumno, instructor y administración (5 a 7 semanas). Sedes, clases y sesiones, reservas, asistencia, disponibilidad, cuentas familiares, estado de cuenta, morosidad, seguimiento de interesados, requisitos de grado, exámenes y asistente virtual en la página web."
- S2 — Cierre: "una sede piloto opera un mes completo en el sistema, con asistencia, cobros y al menos una ronda de exámenes registrados; validación legal de datos personales aprobada."
- S3 — Modelo de datos (plan maestro): "Clases | clases (plantilla semanal), sesiones (fecha concreta), reservas, asistencias, disponibilidad_instructor | Separar la plantilla de la sesión permite cancelar o reprogramar un día puntual"; "Escuela | sedes, disciplinas, grados, requisitos_grado, perfiles_alumno, perfiles_instructor".
- S4 — Permisos: mínimo privilegio. Administración (Director, Administrador, Desarrollador) modifica sedes, clases y sesiones; el resto solo lee. Instructor toma asistencia y fija su disponibilidad; alumno reserva y cancela las suyas.
- S5 — Las migraciones son re-ejecutables y compatibles con la base de producción (ids INT con signo); `horarios` y `reservas_alumno` no se tocan hasta migrar al alumno al flujo nuevo. Supuesto.
- S6 — Fechas y horas se guardan como texto `YYYY-MM-DD` y `HH:MM`: iguales en SQLite y MySQL, sin desfases de zona horaria. Supuesto.

## Tasks

| ID | Specs | Ruta | Estado | Commit |
| --- | --- | --- | --- | --- |
| T1 | S1, S3, S4, S5, S6 | inline | hecho (RED 9 fallos → GREEN 10/10) | 5051c41 (backend), commit de la pantalla (web) |
| T2 | S1, S3, S4 | inline | hecho (RED 10/10 fallos → GREEN) | e468671 (backend), commit del portal (web) |
| T3 | S1, S3 | inline | hecho (RED 6 fallos → GREEN) | commit del backend (T3), commit del portal (T3) |
| T4 | S1 | inline | hecho (RED 15 fallos → GREEN) | commit del backend (T4), commit del sitio y portal (T4) |
| T5 | S1 | inline | hecho (RED 8 fallos → GREEN) | b0e6cec (backend), commit del portal (web) |
| T6 | S1 | inline | hecho (RED 12 fallos → GREEN) | 4f1f293 (backend), commit del portal (web) |
| T7 | S1, S2 | inline | pendiente | — |
| T8 | S1 | inline | pendiente | — |

- T1: sedes, disciplinas, clases (plantilla semanal) y sesiones; API de administración; pantalla de administración.
- T2: reservas de sesiones (alumno) y asistencia (instructor).
- T3: disponibilidad semanal del instructor.
- T4: interesados y clases de prueba (el formulario del sitio los registra; base del asistente virtual).
- T5: cuentas familiares (apoderado y alumnos a cargo).
- T6: estado de cuenta, cargos, pagos por transferencia y morosidad.
- T7: grados, requisitos y exámenes.
- T8: asistente virtual en la página web (n8n).

Ruta: todo inline; sin unidades paralelas ni disparador de writer.

## Log

- L1 (2026-11-13): "continua con el plan fase 2" (el usuario eligió seguir el orden estricto del plan antes que adelantar el asistente).
- L2: T1 verificado: backend 63/63 (10 tests nuevos de la API y 3 de la migración), web 21/21. En Chrome real: ingreso como administrador, crear clase semanal de lunes, generar sesiones de noviembre de 2026 (2, 9, 16, 23 y 30). Defecto de mis pruebas locales: TaskStop no mata el proceso de Node en Windows, por lo que un backend viejo siguió ocupando el puerto; se usó un puerto nuevo.
- L3: T2 verificado: backend 76/76, web 26/26. En Chrome real con tres personas: el administrador crea una clase para una instructora y genera las sesiones; la alumna reserva (1 de 12 cupos); la instructora ve su sesión, marca Presente y guarda; la alumna ve su asistencia. El cupo se toma con un UPDATE condicionado (reservas_activas < cupo): la prueba de reservas simultáneas corre sobre SQLite, que serializa las transacciones; en MySQL (InnoDB) el bloqueo de fila debería dar el mismo resultado, pero no se probó contra MySQL.
- L4 (2026-11-13): "continua con t3 y t4". T3 hecho: backend 84/84, web 27/27. Verificación en navegador del editor de disponibilidad: pendiente, junto con T4.
- L5: T4 hecho y T3 verificado en navegador: backend 101/101, web 32/32. Chrome real: un visitante envía el formulario público (sin consentimiento no envía; con consentimiento queda registrado); el administrador crea una clase, abre al interesado, cambia el estado, agrega una nota y agenda la clase de prueba (el sistema deja las notas automáticas); la instructora guarda su disponibilidad y persiste al recargar. Decisiones: el formulario cae a WhatsApp si el servidor no responde (así no se pierde la persona; hoy el backend de Render está suspendido); el limitador es de 5 envíos por hora por IP y cuenta también los inválidos; `trust proxy` en 1 salto por Render. Pendiente: la política de privacidad se actualizó pero sigue en revisión legal.
- L6 (2026-11-13): "si continua con t5 y t6 y t7". T5 hecho: backend 109/109, web 34/34. Verificación en navegador del panel del apoderado y de familias: pendiente (se hace junto con T6 y T7). Las autorizaciones (consentimientos) quedan solo en la API: no existen textos legales aprobados para mostrarle al apoderado, y no se inventan.
- L7: T6 hecho: backend 124/124, web 38/38. Decisiones del plan que siguen abiertas y por eso NO se inventaron: precios de los planes (los crea la dirección), porcentajes de descuento familiar, días de gracia y suspensión de reservas por morosidad (el reporte acepta `dias_gracia`; no se bloquea nada), datos bancarios para transferir (los entrega la administración), comprobante como archivo (hoy es una referencia de texto).
