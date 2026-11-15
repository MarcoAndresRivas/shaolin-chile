# Asistente por WhatsApp — puente de prueba

Conecta un número de WhatsApp con el asistente virtual para **probarlo**. No es para producción.

> **Riesgo:** usa Baileys, un cliente no oficial de WhatsApp Web. WhatsApp puede restringir o bloquear el número que lo ejecuta. Vincula un número aparte, nunca el de la escuela. Para atender al público, el camino es la API oficial de WhatsApp Business.

## Cómo funciona

1. Llega un mensaje privado de texto al número de prueba.
2. El asistente (`backend/src/asistente.js`, el mismo del chat de la página) lo envía a un modelo local (Ollama) junto con las reglas.
3. Si el modelo necesita datos o debe actuar, el puente llama a la API del backend (`/api/asistente`): ver clases, registrar a la persona, agendar la clase de prueba.
4. El puente responde por WhatsApp.

La conversación se guarda en el backend solo después de que la persona autoriza guardar sus datos y queda registrada. Antes de eso vive en la memoria del proceso y se pierde al reiniciar.

El asistente solo conoce las clases que entrega la API. No tiene precios, direcciones ni la base de conocimiento de la escuela: ante cualquier otra consulta responde que una persona del equipo contestará.

## Requisitos

- Node 20 o superior.
- [Ollama](https://ollama.com) corriendo, con un modelo que soporte herramientas (por defecto `qwen3.5:latest`).
- El backend corriendo con `ASISTENTE_API_KEY` definida (ver el README de la raíz).
- Un número de WhatsApp de prueba, activo en un teléfono.

## Uso

En `backend/.env`, agregar la clave (mínimo 32 caracteres) y levantar el backend:

```
ASISTENTE_API_KEY=<clave>
```

En otra terminal (PowerShell):

```powershell
cd asistente-whatsapp
npm install
$env:ASISTENTE_API_KEY = "<la misma clave>"
$env:WHATSAPP_NUMERO = "56912345678"   # número de prueba, con código de país y sin "+"
npm start
```

La primera vez aparece un código de 8 caracteres. En el teléfono de prueba: WhatsApp > Dispositivos vinculados > Vincular un dispositivo > Vincular con el número de teléfono. Después, escribir al número de prueba desde otro teléfono.

La sesión queda en `auth/` (no se sube al repositorio: equivale a la sesión de WhatsApp del número). Para desvincular, borrar esa carpeta y quitar el dispositivo desde el teléfono.

## Variables

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `ASISTENTE_API_KEY` | — (obligatoria) | Clave compartida con el backend |
| `WHATSAPP_NUMERO` | — (obligatoria la primera vez) | Número a vincular |
| `ASISTENTE_API_URL` | `http://localhost:3000/api/asistente` | Dirección de la API |
| `ASISTENTE_MODELO_URL` | `http://localhost:11434/v1` | Dirección del modelo, en formato OpenAI |
| `ASISTENTE_MODELO` | `qwen3.5:latest` | Modelo |
| `ASISTENTE_MODELO_KEY` | — | Clave del proveedor, si la pide |
| `ASISTENTE_MODELO_RAZONAMIENTO` | `none` | Vacío para dejar razonar al modelo |

## Pruebas

El asistente se prueba en el backend (`cd backend && npm test`), con un modelo simulado. La conexión con WhatsApp (`index.js`) solo se puede probar con un número real.

## Límites conocidos

- Responde a cualquier persona que escriba en privado al número vinculado; no hay lista de números permitidos.
- Solo lee texto: ante audios, fotos o documentos avisa que no puede leerlos.
- Las conversaciones en curso se pierden si el proceso se reinicia.
