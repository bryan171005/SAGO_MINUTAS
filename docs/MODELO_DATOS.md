# Modelo de datos — Fase 2 (WP6)

Este documento describe el estado objetivo de los datos y la capa adaptadora usada
durante la Fase 2. Es el detalle operativo de `docs/FASE_2_PLAN.md`, §4.

## Estado de partida

Verificado en Firestore el 2026-11-24. Los esquemas reales no coinciden con el modelo teórico:

| Colección | Docs | Campos reales |
|---|---|---|
| `usuarios` | 4 | Los 4 son legacy: `nombre, rol, contrasena, fechaAlta`. El perfil Google `e2MGLgZn4ONOqjM6PP25rBz6Fjm1` ya no está en Firestore |
| `clientes` | 2 | `nombreEmpresa, contactoPrincipal, telefono, ciudad, unidadesTotales, fechaRegistro, activo` |
| `minutas` | 7 | `cliente, vendedor, fecha, hora, detalles, actividades, estatus, fotoBase64` (5 con `latitud, longitud, ubicacionTexto`) |

Firebase Auth sí conserva 2 cuentas: `qa@sagominutas.test` (uid `e2MGL…`) y
`bryan171005@gmail.com` (uid `oTka…`). Un login con Google recrea el documento de perfil en
Firestore; `auth.service.ts` le asigna `rol: gerente` solo si el correo está en `ADMIN_EMAILS`,
y `operador` en caso contrario.

El `dry-run` de WP6 se ejecutó contra estos datos el 2026-11-24 y reportó: 7 minutas
normalizadas, 2 clientes normalizados, 6 fotos pendientes de subir, 0 fotos omitidas y
4 usuarios saneados. **No escribió nada**: los datos siguen intactos hasta que se ejecute
`--apply`.

## Modelo objetivo

```text
usuarios/{uid}  { uid, nombre, email, rol: "operador"|"gerente", activo,
                  proveedor: "google", fechaAlta, ultimoAcceso }   # sin contrasena
clientes/{id}   { nombre, direccion, contacto, activo }
minutas/{id}    { vendedorId, vendedorNombre, clienteId, clienteNombre,
                  fecha, hora, actividades, detalles,
                  estatus: "Pendiente"|"Autorizado"|"Rechazado",
                  fotoUrl, ubicacion?, createdAt, updatedAt, syncOrigen? }
eventos/{id}    { tipo, minutaId, payload, consumidoEn, createdAt }  # Fase 5, no se crea aqui
```

`resumenIA` y `eventos` quedan para la Fase 5: no se crean ni se rellenan en esta fase.

## Adaptadores de compatibilidad

Android y el panel web siguen leyendo Firestore directo hasta las Fases 3 y 6. Por eso
la migración **añade** campos nuevos y **conserva** los viejos (`merge: true`), salvo
`contrasena`, que se elimina.

| Campo objetivo | Campo real actual | Regla |
|---|---|---|
| `clienteNombre` | `cliente` | copia directa |
| `clienteId` | `cliente` | búsqueda en `clientes` por `nombreEmpresa`; `null` si no existe |
| `vendedorNombre` | `vendedor` | copia directa |
| `vendedorId` | `vendedor` | búsqueda en `usuarios` por `nombre`; `null` si no existe |
| `direccion` | `ciudad` | copia directa (se conservan todos los campos viejos) |
| `contacto` | `contactoPrincipal` | copia directa |
| `fotoUrl` | `fotoBase64` | subida a `fotos/{minutaId}.{ext}` y guardado de la URL; se conserva `fotoBase64` hasta Fase 3 |
| `ubicacion` | `latitud, longitud, ubicacionTexto` | agrupación opcional `{ latitud, longitud, texto }` |

Las comparaciones de nombre se hacen en minúsculas para resolver las referencias.

## Usuarios legacy y excepción documentada a la tarea 8

La tarea 8 del plan pide *"quitar el campo `contrasena`, asignar `uid`/rol a los usuarios
actuales"*. La segunda parte **no se puede cumplir automáticamente**: los 4 usuarios actuales
no tienen `email` ni `uid` de Firebase Auth, y Auth solo contiene las 2 cuentas Google
anteriores. No existe una correspondencia fiable para asignarles un `uid`.

**Decisión acordada para Fase 2:** se documenta la excepción y se aplica la parte que sí es
posible — borrar `contrasena` y marcar los perfiles como legacy inactivos. El acceso `gerente`
se garantiza recreando el perfil Google al iniciar sesión (`auth.service.ts`), no migrando
estos 4 documentos. Si más adelante se quiere la correspondencia exacta, hay que crear las
cuentas en Firebase Auth y vincularlas manualmente por `uid`; queda fuera de WP6.

En consecuencia, al aplicar la migración:

- Se exporta un backup antes de cualquier escritura.
- Se elimina `contrasena`.
- Se marcan `activo: false`, `migrado: false`, `proveedor: "legacy"`.
- **No se borran**: el historial de minutas los referencia por nombre.

Los usuarios nuevos siguen creándose por `uid` con el flujo de Fase 1, que respeta roles.

## Fotos

- Las fotos dejan de vivir dentro del documento y pasan a Firebase Storage.
- Ruta determinista: `fotos/{minutaId}.{jpg|png|webp}` (idempotente: una segunda ejecución
  sobrescribe el mismo objeto).
- Se acepta `fotoBase64` como data URL (`data:image/...;base64,...`) o como base64 puro
  (en ese caso se trata como JPEG). Los alias se normalizan: `image/jpg` → `image/jpeg`.
  Se aceptan `jpeg/jpg`, `png`, `webp`, `gif`, `bmp`, `heic` y `heif`; se rechazan SVG y
  tipos no raster porque el archivo se sirve públicamente desde Storage.
- Si una minuta tiene `fotoBase64` sin `fotoUrl` y el tipo no es aceptado, el script lo
  omite y lo avisa en la salida con el id y el MIME detectado (nunca con el contenido).
  Esos avisos permiten confirmar con datos reales si falta algún formato por soportar.
- El resumen de `--dry-run` indica `fotos pendientes de subir`; el de `--apply` indica
  `fotos subidas`, para que el modo solo lectura no sugiera que se subió algo.
- El bucket se resuelve en `src/config/storage.ts`: `FIREBASE_STORAGE_BUCKET` si está
  definido; si no, `<FIREBASE_PROJECT_ID>.appspot.com`. La misma función (`nombreBucket()`)
  se usa para construir la URL en `--dry-run` y para subir el archivo en `--apply`, de modo
  que no pueden divergir. En proyectos nuevos con bucket `*.firebasestorage.app` hay que
  definir la variable de entorno.
- La URL se construye con el endpoint `firebasestorage.googleapis.com`, que aplica las
  reglas de Storage; `storage.rules` permite lectura pública de `fotos/**` y deniega
  toda escritura desde cliente (solo Admin SDK puede escribir).
- `fotoBase64` se conserva en el documento hasta que Android migre en Fase 3.

## Reglas e índices

- `backend/firestore.rules`: `allow read, write: if false` para todo. El backend usa
  Admin SDK y no está sujeto a reglas.
- `backend/storage.rules`: lectura pública en `fotos/**`, escritura denegada al cliente.
- `backend/firebase.json`: apunta a ambos archivos y a `firestore.indexes.json`.
- Índices compuestos de `minutas`: `estatus+fecha`, `clienteId+fecha`, `vendedorId+fecha`.
  Los dos últimos solo son útiles para documentos ya normalizados por la migración.

### Decisión de activación

Las reglas se dejan preparadas pero **no se despliegan al finalizar WP6**. Se activan al
cierre de la Fase 2, después de verificar los 13 endpoints nuevos, para reducir la ventana
en la que Android y web dejan de funcionar (ambos escriben Firestore directo hoy). Si se
necesita una demo intermedia, las reglas pueden relajarse temporalmente y volver a
cerrarse; esa decisión queda registrada aquí.

## Estado de cierre de WP6 (2026-11-24)

- **Listo:** `storage.ts`, reglas, `firebase.json`, índices, script de migración, adaptadores y
  `docs/MODELO_DATOS.md`.
- **Verificado:** `npm run typecheck`, `npm run typecheck:scripts`, `npm run build`, `npm test`
  (46/46) y `npm run migrar:dry-run` contra Firestore real (0 escrituras).
- **Pendiente y deliberadamente diferido hasta el cierre de Fase 2:** `migrar:apply`, el despliegue
  de `firestore.rules` / `storage.rules` / índices y la verificación del deploy de WP6 en Render.
- **Excepción documentada:** la parte de "asignar `uid`" de la tarea 8 no se aplica a los 4
  usuarios legacy; ver la sección anterior.

## Migración

```powershell
cd backend
npm run migrar:dry-run   # imprime el plan, no escribe nada
npm run migrar:apply     # exporta backup y aplica cambios
```

Si PowerShell bloquea `npm.ps1`, usa el ejecutable que tenga instalado (`npm` / `npm.cmd`).
El `dry-run` necesita `FIREBASE_SERVICE_ACCOUNT_BASE64` o `GOOGLE_APPLICATION_CREDENTIALS`
apuntando al service account, que vive fuera del repo.

`--apply` requiere `FIREBASE_SERVICE_ACCOUNT_BASE64` o credenciales ADC. Los backups se
guardan en `backend/backups/<fecha>/` y están excluidos de Git por contener datos personales.
Si se pasan `--apply` y `--dry-run` a la vez, gana `--dry-run`.
