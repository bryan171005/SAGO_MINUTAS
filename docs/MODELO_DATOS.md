# Modelo de datos — Fase 2 (WP6)

Este documento describe el estado objetivo de los datos y la capa adaptadora usada
durante la Fase 2. Es el detalle operativo de `docs/FASE_2_PLAN.md`, §4.

## Estado de partida

Antes de la Fase 2 los esquemas reales no coinciden con el modelo teórico:

| Colección | Docs | Campos reales |
|---|---|---|
| `usuarios` | 4 | 3 legacy: `nombre, rol, contrasena, fechaAlta`. 1 Google: `uid, nombre, email, rol, activo, proveedor, fechaAlta, ultimoAcceso` |
| `clientes` | 1 | `nombreEmpresa, contactoPrincipal, telefono, ciudad, unidadesTotales, fechaRegistro, activo` |
| `minutas` | 6 | `cliente, vendedor, fecha, hora, detalles, actividades, estatus, fotoBase64` (4 con `latitud, longitud, ubicacionTexto`) |

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

## Usuarios legacy

Los 3 usuarios antiguos no tienen `uid` de Firebase Auth ni `email`, así que no pueden
convertirse en cuentas Google de forma automática:

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

## Migración

```powershell
cd C:\Users\jonyg\StudioProjects\SAGO_MINUTAS\backend
npm.cmd run migrar:dry-run   # imprime el plan, no escribe nada
npm.cmd run migrar:apply     # exporta backup y aplica cambios
```

`--apply` requiere `FIREBASE_SERVICE_ACCOUNT_BASE64` o credenciales ADC. Los backups se
guardan en `backend/backups/<fecha>/` y están excluidos de Git por contener datos personales.
Si se pasan `--apply` y `--dry-run` a la vez, gana `--dry-run`.
