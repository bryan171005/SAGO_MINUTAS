# Evidencias — Fase 1

**Fecha:** 2026-11-20
**API:** `https://sago-api.onrender.com` (servicio `sago-api` reutilizado en Render)
**Código desplegado:** rama `CopiaHugo`, commit `f8077` (WP1 + WP2)
**Documentación de WP3:** commit `1e054` en `feature/swagger-tests`

La fuente de verdad del contrato es `backend/openapi.yaml`. Este índice apunta a las pruebas
reales de la Fase 1: identidad (health + Google) y Swagger. Las minutas llegan en la Fase 2.

## 1. Índice

| Evidencia | Archivo | Qué demuestra | Estado |
|---|---|---|---|
| Health en producción | `fase-1/api/health.json`, `fase-1/health-produccion.png` | URL pública viva, `200`, `{ "status": "ok" }` | ✅ |
| Contrato publicado | `fase-1/api/openapi.json`, `fase-1/swagger-produccion.png` | `/openapi.json` válido y `/docs/` con los 3 endpoints | ✅ |
| Sin token | `fase-1/api/me-sin-token-401.json` | `401 UNAUTHORIZED` en `GET /api/v1/auth/me` | ✅ |
| Body inválido | `fase-1/api/google-body-invalido-400.json` | `400 VALIDATION_ERROR` en `POST /api/v1/auth/google` | ✅ |
| Tests y typecheck | salida de `npm test` / `npm run typecheck` | 2 archivos, **32/32 tests**, typecheck y build en verde | ✅ |
| Dashboard de Render | `fase-1/render-servicio.png` | Servicio `sago-api` en **Live**, rama `CopiaHugo` | ⏳ pendiente (requiere sesión en Render) |
| Perfil en Firestore | `fase-1/firebase/firestore-usuario.png` | `usuarios/{uid}` con `rol: gerente` | ⏳ pendiente (requiere sesión en Firebase) |

> Las dos capturas pendientes son de consolas que exigen login. El navegador integrado no está
> autenticado, así que no se tomaron capturas falsas: deben sacarse desde la sesión del dueño del
> proyecto y guardarse con esos mismos nombres. La de Firestore va en la carpeta
> `fase-1/firebase/` que ya existe para las evidencias de Firebase (plan §3.2.6).

## 2. Respuestas HTTP capturadas

`GET https://sago-api.onrender.com/health` → `200`

```json
{ "status": "ok", "uptime": 11.41, "timestamp": "2026-11-20T20:20:41.571Z" }
```

`GET https://sago-api.onrender.com/api/v1/auth/me` (sin header) → `401`

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Token de autorizacion ausente" } }
```

`POST https://sago-api.onrender.com/api/v1/auth/google` con body `{}` → `400`

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "idToken debe ser un texto" } }
```

`GET https://sago-api.onrender.com/openapi.json` → `200`

- `openapi: 3.0.3`
- `info.title: SAGO Minutas API`
- paths: `/health`, `/api/v1/auth/google`, `/api/v1/auth/me`
- 6 componentes de respuesta (`ValidationError`, `PayloadTooLarge`, `Unauthorized`, `Forbidden`,
  `NotFound`, `InternalError`)

`GET /docs` → `301` a `/docs/`, que sirve Swagger UI con título `SAGO API`.

CORS verificado con `Origin: http://localhost:5173` → `access-control-allow-origin: http://localhost:5173`.

## 3. Cómo se generaron

```powershell
$base = "https://sago-api.onrender.com"
$dir  = "docs\evidencias\fase-1\api"

curl.exe -s --max-time 120 -o "$dir\health.json" "$base/health"
curl.exe -s --max-time 120 -o "$dir\openapi.json" "$base/openapi.json"
curl.exe -s --max-time 120 -o "$dir\me-sin-token-401.json" "$base/api/v1/auth/me"
curl.exe -s --max-time 120 -o "$dir\google-body-invalido-400.json" `
  -X POST -H "Content-Type: application/json" --data-binary "{}" "$base/api/v1/auth/google"
```

## 4. Seguridad

- No se capturó ningún **Firebase ID token**, llave de service account ni base64.
- La colección Postman tiene la variable `token` vacía.
- `.env`, `backend/.env` y `*firebase-adminsdk*.json` siguen fuera del control de versiones.
- Ninguna captura muestra credenciales.

## 5. Pendiente para dar la Fase 1 por cerrada

1. Capturas `render-servicio.png` y `firestore-usuario.png`.
2. Merge de `feature/swagger-tests` → `CopiaHugo` y push.
3. Tag `v0.2.0-fase1`.
