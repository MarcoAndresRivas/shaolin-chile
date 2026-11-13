# Prompt — Lanzamiento de la Temporada de Seminarios

Prompt para usar con Claude Code (u otro agente) en la carpeta del proyecto. Complementa `docs/plan-maestro.md`. Los puntos marcados **[DEFINIR]** son decisiones pendientes de la dirección: el agente debe preguntarlos antes de construir.

---

# ROL Y OBJETIVO
Actúa como Arquitecto de Operaciones y Estratega Digital especializado en automatización con n8n, integración con Instagram y venta de eventos deportivos y culturales. Tu objetivo es planificar e implementar en nuestra plataforma el lanzamiento de la **Temporada de Seminarios de Kung Fu Shaolin en Chile**, basada en el linaje tradicional de la 32.ª generación de Shi De Yang y en el modelo híbrido de academias de China, España y Argentina. Todo contenido técnico o de linaje que se publique debe ser validado por José Cuevas, instructor principal.

# CONTEXTO OBLIGATORIO
- Lee primero `docs/plan-maestro.md`. Es la referencia del proyecto: módulos, roles, modelo de datos, protección de datos y hoja de ruta. Si algo de este prompt contradice el plan, avísame antes de continuar; no lo resuelvas por tu cuenta.
- Stack actual: backend Node.js + Express, base de datos MySQL (Aiven), despliegue en Render, frontend en HTML estático. No hay tienda implementada.
- Antes de agregar funcionalidades deben estar resueltas las correcciones de seguridad de la Fase 0 del plan (credenciales fuera del repositorio, claves rotadas).

# PRINCIPIO DE ARQUITECTURA
- **El backend es la fuente de verdad.** Productos, precios, cupos, stock, reservas, descuentos y pagos se calculan y guardan en el backend, con transacciones que impidan vender dos veces el mismo cupo.
- **Un pago solo se confirma en el backend.** En este lanzamiento los pagos son por transferencia bancaria: la confirmación la hace una persona de la administración desde el panel, tras revisar el comprobante. Nunca se confirma un pago desde n8n ni desde un mensaje.
- **n8n solo orquesta:** escucha eventos del backend y de Instagram, envía mensajes y correos, y llama a la API del backend. Si n8n falla, no se pierde ninguna venta ni se corrompe ningún dato.
- Diseña el pago para que más adelante se pueda agregar una pasarela (Webpay, Mercado Pago o Flow) sin rehacer el flujo de compra.

# CANALES
- Sin WhatsApp por ahora.
- Canales: Instagram (comentarios y mensajes directos), n8n, correo electrónico y nuestra plataforma web (registro, compra, carga del comprobante y área de alumnos).
- Instagram se conecta mediante **ManyChat**, que ya cuenta con aprobación de Meta; ManyChat se comunica con n8n por webhooks.

# MODELO DE SEMINARIOS (según el plan maestro)
- Una **temporada** (ej. diciembre) tiene varios **fines de semana**, de viernes a domingo, cada uno con su sede, instructores, temática y cupo.
- Una **compra** puede incluir varios fines de semana, varias entradas y artículos de la tienda.
- Cada **entrada** es nominativa: un asistente con su QR y su exención de responsabilidad aceptada. Los nombres se pueden asignar después de pagar, hasta el cierre de inscripciones.
- **Cierre de inscripciones:** 12 horas antes del inicio de cada clase y fin de semana. Después de esa hora no se vende, no se cambia de fecha ni se traspasan entradas.

# PRODUCTOS (precios en CLP)
1. **Clase (Taller de Iniciación):** 2 a 3 horas, sábado en la mañana de cada fin de semana. Público general, Qi Gong básico y filosofía Chan. Precio: **$35.000**. Cupo: **50 por clase**.
2. **Seminario de fin de semana:** viernes a domingo (3 días). Forma tradicional de mano vacía (ej. Xiao Hong Quan) y Qi Gong (Ba Duan Jin). Para practicantes y artistas marciales. Precio: **$75.000**. Cupo: **50 por fin de semana**.
3. **Poleras y artículos:** poleras y otros productos de la escuela, que se pueden agregar a la misma compra. Con variantes (talla, color) y control de stock. Mientras Maxi Muñoz prepara el catálogo definitivo, usa el **catálogo de prueba** del módulo 5 en `docs/plan-maestro.md` (11 productos con códigos, variantes, precios y stock referenciales). Carga los productos como datos editables desde el panel, no escritos en el código.
4. **Clase online:** quien contrata una clase online obtiene acceso privado en la plataforma a los videos de esa clase. Este es el material grabado de las formas enseñadas, que se entrega a través del módulo de cursos online del plan, **con derecho a descargar el video**. Precio: **$25.000**. Licencia de uso personal: el video no se puede redistribuir. Como el video se puede descargar, el retracto solo aplica antes de verlo o descargarlo, y esto se informa de forma expresa antes del pago.
5. **Retiro de Inmersión "Estilo China"** (3 a 4 días, alojamiento y comidas): evento aparte, fuera de este lanzamiento salvo indicación. Precio: **[DEFINIR]**.

# REGLAS COMERCIALES
- **Preventa:** 35 % de descuento para los primeros **15 cupos de cada fin de semana**. Un cupo de preventa queda apartado mientras su transferencia está pendiente; si el plazo vence sin pago, el cupo y su precio de preventa se liberan.
- **Escuelas Aliadas (kung fu y otras organizaciones):** un representante con cuenta propia y un código de convenio, para delegaciones de 5 personas o más. Beneficio: **10 % de descuento** y **cupos liberados**, cuya cantidad asigna la administración al aprobar cada convenio.
- **Gestión de convenios:** aún no hay organizaciones definidas. Construye en el panel de administración una sección para agregar, editar, pausar y dar de baja convenios: organización, tipo, representante, código, porcentaje de descuento (10 % por defecto), cupos liberados, vigencia y estado. Dar de baja desactiva el código, pero conserva el historial de compras; nunca se borra.
- Promociones del plan: alumno de Shaolin Chile, pack de temporada (varios fines de semana) y descuento por grupo.
- Cupos liberados y descuentos se registran por compra, para poder reportarlos por organización.

# PAGO POR TRANSFERENCIA
1. Al confirmar la compra, el backend la deja **pendiente de pago**, reserva los cupos y el stock, y muestra los datos bancarios y el monto exacto con un código de compra para indicar en la transferencia.
2. El comprador sube el comprobante desde su cuenta (o lo envía por correo, y la administración lo adjunta).
3. La administración revisa la cuenta bancaria y valida la compra en el panel. Recién entonces se emiten las entradas con QR, se descuenta el stock en firme y se emite la boleta.
4. Plazo para transferir: hasta el cierre de inscripciones (12 horas antes del inicio). A esa hora, las compras sin pago validado se anulan y se liberan cupos y stock.
5. Panel de administración: lista de compras pendientes, con comprobante, monto esperado y botón para validar o rechazar.

# CUMPLIMIENTO
- Ley 21.719: consentimiento explícito para guardar datos, autorización del apoderado para menores de edad y política de privacidad publicada.
- El bot se presenta como asistente virtual y deriva a una persona cuando no sabe algo, hay un reclamo, un tema de salud o la persona lo pide.
- Boleta electrónica por cada venta validada.
- Exención de responsabilidad aceptada en línea, guardada con fecha.
- Política de cambios y devoluciones (tabla del módulo 5 en `docs/plan-maestro.md`), publicada en el sitio y aceptada antes del pago. Debe modelarse en el sistema: retracto de 10 días antes del inicio, cambio de fin de semana y traspaso de entrada hasta el cierre de inscripciones, devolución o cambio si la escuela cancela, y garantía legal de 6 meses para artículos.
- Correo enviado desde el dominio propio, con la configuración que evita que los mensajes lleguen a spam.
- Los comprobantes de transferencia se guardan de forma privada, visibles solo para la administración.

# FLUJOS A DISEÑAR
1. **Captación en publicaciones y reels (ManyChat → n8n):** detectar comentarios con las palabras `shaolin`, `info`, `seminario` o `cupo`. Responder en público con variaciones (no siempre el mismo texto) y enviar un mensaje privado con los productos y un enlace a la web.
2. **Agente de IA en mensajes directos (ManyChat → n8n):** responde preguntas frecuentes (linaje, horarios, niveles, qué llevar, cómo pagar) usando solo una base de conocimiento validada por José. Envía un enlace a la web con un **código firmado y de un solo uso** que vincula la conversación con el registro; nunca el nombre de usuario de Instagram en la dirección.
3. **Compra y confirmación:** la web registra la compra; el backend reserva cupos y stock, aplica promociones y deja la compra pendiente de transferencia. n8n envía por correo las instrucciones de pago. Cuando la administración valida el pago, el backend emite las entradas y avisa a n8n, que envía la confirmación por correo (comprobante, QR y acceso a la cuenta) y, si la persona conversó por Instagram en las últimas 24 horas, también por mensaje directo.
4. **Recordatorio de transferencia pendiente:** si una compra sigue pendiente, n8n envía un mensaje directo a las 12 horas, solo a quien tiene abierta la ventana de 24 horas de Instagram. A todos los demás, el recordatorio es por correo, antes de que venza el plazo. Las reservas vencidas las libera el backend.

# CRONOGRAMA (12 semanas, a validar contra la hoja de ruta)
- Semanas 1 y 2: configuración técnica (Fase 0 resuelta, compra con transferencia, panel de validación, n8n, ManyChat).
- Semanas 3 a 6: lanzamiento orgánico en Instagram, captación de interesados y venta con preventa.
- Semanas 7 a 10: venta a precio normal, recordatorios y venta de poleras y artículos.
- Semanas 11 y 12: cierre de inscripciones, envío de credenciales QR y activación del acceso a los videos para quienes contrataron la clase online.
Si el cronograma no es realista con lo que existe hoy, dímelo y propón qué recortar.

# TU PRIMERA TAREA
No generes código ni JSON de n8n todavía. Entrégame:
1. Las contradicciones o vacíos que encuentres entre este prompt y `docs/plan-maestro.md`.
2. Las preguntas técnicas que necesitas resueltas, incluidos todos los [DEFINIR] pendientes y el estado de nuestra cuenta de Instagram profesional y de ManyChat.
3. Una propuesta de plan de ejecución paso a paso:
   - tablas de base de datos, alineadas con el modelo de datos del plan
   - endpoints del backend y webhooks entre backend, n8n y ManyChat
   - estructura de nodos de cada flujo de n8n
   - en qué orden se construye y cómo se prueba cada parte
