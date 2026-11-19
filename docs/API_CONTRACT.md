
# Contrato de API — SAGO Minutas (Fase 1)

Documento legible para los clientes (Android en Fase 3, panel web en Fase 6).
La **fuente de verdad** es `backend/openapi.yaml`; este archivo es su resumen en prosa.
Si hay diferencia, prevalece `openapi.yaml`.

Estado: Fase 1 — solo identidad. Minutas, clientes, fotos y reglas de Firestore llegan en la Fase 2.

## 1. URL base

| Entorno              | Base                              |
| -------------------- | --------------------------------- |
| Local                | `http://localhost:3000`         |
| Producción (Render) | `https://sago-api.onrender.com` |

Prefijo de la API: `/api/v1`. El health check **no** lleva prefijo.

> El plan gratuito de Render duerme tras ~15 min sin tráfico; la primera petición puede tardar ~50 s.

## 2. Autenticación

El backend solo acepta un **Firebase ID token**, obtenido en el cliente con
`FirebaseAuth.currentUser.getIdToken()`. **No** es el `idToken` crudo de Google ni la Web API key
(`AIza...`).

En las rutas protegidas:

```http
Authorization: Bearer <Firebase ID token>
```

`POST /auth/google` no necesita ese header: recibe el token en el body.

## 3. Endpoints

| Método | Ruta                    | Auth   | Descripción                                          |
| ------- | ----------------------- | ------ | ----------------------------------------------------- |
| GET     | `/health`             | no     | Estado del proceso (no consulta Firebase)             |
| POST    | `/api/v1/auth/google` | no     | Verifica el token y crea/actualiza `usuarios/{uid}` |
| GET     | `/api/v1/auth/me`     | Bearer | Devuelve el perfil del `uid` del token              |

Cualquier otra ruta responde `404 NOT_FOUND`.

### 3.1 GET /health

Respuesta `200`:

```json
{ "status": "ok", "uptime": 123.45, "timestamp": "2026-11-13T18:00:00.000Z" }
```

### 3.2 POST /api/v1/auth/google

Request:

```http
POST /api/v1/auth/google
Content-Type: application/json

{ "idToken": "eyJhbGciOiJSUzI1NiIs..." }
```

Respuesta `200`:

```json
{
  "usuario": {
    "uid": "e2MGLgZn4ONOqjM6PP25rBz6Fjm1",
    "nombre": "Hugo Ponce",
    "email": "qa@sagominutas.test",
    "rol": "gerente",
    "activo": true,
    "proveedor": "google",
    "fechaAlta": "2026-11-19T02:45:55.896Z",
    "ultimoAcceso": "2026-11-19T02:45:55.896Z"
  }
}
```

Errores propios: `400` (body inválido), `401` (token inválido/expirado/sin email),
`403` (usuario inactivo), `413` (body grande), `500`.

### 3.3 GET /api/v1/auth/me

Request:

```http
GET /api/v1/auth/me
Authorization: Bearer <Firebase ID token>
```

Respuesta `200`: el mismo objeto `{ "usuario": { ... } }`. **No escribe** en Firestore.

Errores propios: `401` (token ausente/inválido), `403` (inactivo),
`404` (no existe `usuarios/{uid}`), `500`.

## 4. Formato de error

Todas las respuestas fallidas tienen la misma forma:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Token invalido o expirado" } }
```

| HTTP | `code`              | `message`                                                                                                 | Cuándo                                                                     |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`  | `idToken es obligatorio` / `idToken debe ser un texto` / `El cuerpo de la peticion no es JSON valido` | Falta `idToken`, no es string o el JSON está mal formado                 |
| 401  | `UNAUTHORIZED`      | `Token de autorizacion ausente`                                                                           | Falta el header `Authorization`                                           |
| 401  | `UNAUTHORIZED`      | `Token invalido o expirado`                                                                               | Bearer inválido, malformado o vencido                                      |
| 401  | `UNAUTHORIZED`      | `Token sin email`                                                                                         | El token verificado no trae `email`                                       |
| 403  | `FORBIDDEN`         | `Usuario inactivo`                                                                                        | `usuarios/{uid}.activo === false`                                         |
| 403  | `FORBIDDEN`         | `Rol insuficiente`                                                                                        | `requireRole(...)` con un rol no permitido (middleware listo para Fase 2) |
| 404  | `NOT_FOUND`         | `Usuario no registrado`                                                                                   | Token válido pero sin documento `usuarios/{uid}`                         |
| 404  | `NOT_FOUND`         | `Ruta no encontrada: GET /...`                                                                            | Ruta inexistente                                                            |
| 413  | `PAYLOAD_TOO_LARGE` | `El cuerpo de la peticion excede el tamano permitido`                                                     | Body demasiado grande                                                       |
| 500  | `INTERNAL_ERROR`    | `Error interno del servidor`                                                                              | Error no controlado                                                         |

## 5. Modelo `usuario`

| Campo            | Tipo                       | Notas                                                               |
| ---------------- | -------------------------- | ------------------------------------------------------------------- |
| `uid`          | string                     | ID del documento, coincide con Firebase Auth                        |
| `nombre`       | string                     | Del documento si existe; si no, del token; si no, prefijo del email |
| `email`        | string                     | Del token (se actualiza en cada login)                              |
| `rol`          | `operador` o `gerente` | Ver regla abajo                                                     |
| `activo`       | boolean                    | `false` → `403`                                                |
| `proveedor`    | `google`                 | Siempre `google` en Fase 1                                        |
| `fechaAlta`    | ISO 8601                   | Se conserva en logins posteriores                                   |
| `ultimoAcceso` | ISO 8601                   | Se renueva en cada login                                            |

**No se guarda `contrasena`.** Los documentos viejos con ID automático y contraseña siguen en
Firestore y se migran en la Fase 2; no se borran.

### Regla de rol

1. Si `usuarios/{uid}` ya existe → se conserva su `rol`.
2. Si es nuevo y su email está en `ADMIN_EMAILS` → `gerente`.
3. En cualquier otro caso → `operador`.
4. Comparación de emails en minúsculas y sin espacios.

## 6. CORS

Orígenes permitidos según `CORS_ORIGINS` (local por defecto): `http://localhost:5173`,
`http://localhost:3000`. En Render se ajusta al origen real del panel web.

## 7. Ejemplo para Android (Fase 3, aún no implementado)

Base URL de Retrofit: `https://sago-api.onrender.com/api/v1/`.

```kotlin
interface SagoApi {
    @POST("auth/google")
    suspend fun login(@Body body: LoginRequest): LoginResponse

    @GET("auth/me")
    suspend fun me(@Header("Authorization") bearer: String): LoginResponse
}

data class LoginRequest(val idToken: String)
data class LoginResponse(val usuario: Usuario)

data class Usuario(
    val uid: String,
    val nombre: String,
    val email: String,
    val rol: String,
    val activo: Boolean,
    val proveedor: String,
    val fechaAlta: String,
    val ultimoAcceso: String,
)
```

Obtención del token y llamada:

```kotlin
val idToken = Firebase.auth.currentUser!!.getIdToken(true).await().token!!
val perfil = api.me("Bearer $idToken").usuario
```

> Hoy la app Android **no** consume esta API: sigue con Firestore directo y login por contraseña.
> Este bloque es la guía para la Fase 3.

## 8. Verificación rápida

```powershell
curl.exe -s -w "`n-> %{http_code}`n" --noproxy "*" http://127.0.0.1:3000/health
curl.exe -s -w "`n-> %{http_code}`n" --noproxy "*" http://127.0.0.1:3000/api/v1/auth/me
```

Esperado: `200` y `401` respectivamente.
