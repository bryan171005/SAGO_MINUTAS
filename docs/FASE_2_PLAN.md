# Fase 2 — API de negocio + Firestore seguro

**Duración estimada:** 2 días (días 4–5 del cronograma) · **Equipo:** 3 personas · **Rama base:** `CopiaHugo` (punta `a98bf`, tag `v0.2.0-fase1`)

**Resultado esperado:** se puede crear, listar, filtrar y autorizar una minuta **solo con la API documentada**; Firestore rechaza escrituras directas del cliente. Las fotos dejan de vivir dentro del documento y pasan a Firebase Storage.

> Fuente: `docs/PLAN_CUMPLIMIENTO_RUBRICA.md`, sección **“Fase 2 — API de negocio + Firestore seguro”** (tareas 1–10), sección 3.3 (endpoints), 3.4 (modelo de datos), 6.4 (reparto sugerido), 7 (cronograma) y 10 (riesgos). Este archivo es el desglose operativo, no sustituye al documento original.

---

## 0. Dónde encaja esta fase

```text
Fase 1  ✅ API base + auth Google + Swagger + deploy   (cerrada en v0.2.0-fase1)
Fase 2  ⬅ API de negocio + Firestore seguro            (esta fase)
Fase 3    Refactor Android (Screaming Architecture) + Retrofit
Fase 4    Room + WorkManager + offline
Fase 5    Google Sign-In nativo, Gemini, RabbitMQ
Fase 6    Web contra API + CI/CD + traducciones
```

La Fase 1 entregó la **identidad** (quién eres). La Fase 2 entrega los **datos** (qué hiciste). La app y el panel siguen sin cambiar en esta fase.

---

## 1. Estado real de partida (consultado en Firestore, solo lectura)

| Colección | Docs | Campos que hay hoy |
|---|---|---|
| `usuarios` | 4 | 3 viejos: `nombre, rol, contrasena, fechaAlta`. 1 nuevo: `uid, nombre, email, rol, activo, proveedor, fechaAlta, ultimoAcceso` |
| `clientes` | 1 | `nombreEmpresa, contactoPrincipal, telefono, ciudad, unidadesTotales, fechaRegistro, activo` |
| `minutas` | 6 | `cliente, vendedor, fecha, hora, detalles, actividades, estatus, fotoBase64` (4 también tienen `latitud, longitud, ubicacionTexto`) |

### Dos hallazgos que condicionan el plan

1. **Los esquemas reales no coinciden con el modelo teórico** de la sección 3.4 del plan original (`clienteId`, `vendedorNombre`, `fotoUrl`). No se puede hacer un rename directo: hace falta una capa **adaptadora**.
2. **Las fotos ya están como `fotoBase64` dentro de cada minuta**. Hay que extraerlas a Storage y dejar `fotoUrl`, sin perder las existentes (riesgo *“datos viejos inconsistentes”*, §10).

### Consecuencia de cerrar Firestore

Hoy Android y el panel web escriben/leen Firestore directo. Al aplicar `allow read, write: if false` (tarea 6), **dejan de funcionar hasta la Fase 3 (Android) y Fase 6 (web)**. Es el criterio de aceptación del plan y se asume, con dos mitigaciones:

- **Backup exportado antes de migrar** (§10 del plan original).
- **Activar las reglas al final de Fase 2**, una vez verificada toda la API, para reducir la ventana de rotura. Si hiciera falta una demo intermedia, las reglas se pueden relajar temporalmente y volver a cerrar; queda documentado.

---

## 2. Alcance

### Incluido (tareas 1–10 del plan original)

1. CRUD de `minutas` con Zod, paginación (`?page=&limit=`), filtros (`estatus`, `cliente`, `vendedor`, rango de fechas) y orden.
2. `PATCH /minutas/{id}/estatus` con validación de rol y transición `Pendiente → Autorizado | Rechazado`.
3. CRUD de `clientes` y `usuarios` (baja lógica).
4. `GET /metricas/resumen` (totales por estatus, por cliente, por día).
5. Subida de foto: `POST /minutas/{id}/foto` con `multer` → Firebase Storage → guardar `fotoUrl`.
6. Reglas de Firestore (`firestore.rules`) denegando acceso cliente; `firebase.json` y reglas de Storage.
7. Índices compuestos (`firestore.indexes.json`).
8. Migración de datos: quitar `contrasena`, asignar `uid`/rol a los usuarios actuales.
9. Ampliar Swagger con todos los endpoints, ejemplos y códigos de error.
10. Colección Postman exportada en `docs/`.

### Fuera de alcance

- Cambios en Android (Fase 3) y en el panel web (Fase 6).
- Room, WorkManager y modo offline (Fase 4).
- Google Sign-In nativo, Gemini y RabbitMQ (Fase 5).
- CI/CD y traducciones (Fase 6).

---

## 3. Reparto entre los 3 integrantes

Basado en la tabla **6.4 Reparto sugerido** del plan original (A = backend/Firestore/Swagger/deploy; B = Android/tests/revisión; C = web/QA/docs/revisión). Como Fase 2 es casi toda backend, se reparte de forma que **los 3 tengan commits y revisiones**, evitando el riesgo *“un integrante concentra los commits”* (§10).

| WP | Responsable | Rama | Tareas del plan original | Archivos que posee | Revisado por |
|---|---|---|---|---|---|
| **WP6** | Tercero (C) | `feature/datos-seguros` | 6, 7, 8 | `firestore.rules`, `storage.rules`, `firebase.json`, `firestore.indexes.json`, `scripts/migrar-datos.*`, `src/config/storage.ts`, `docs/MODELO_DATOS.md` | Bryan |
| **WP7** | Bryan (A) | `feature/api-minutas` | 1, 2, 5 | `src/minutas/**`, `tests/minutas.test.ts`, `app.ts` (solo él lo edita) | Hugo |
| **WP8** | Hugo (B) | `feature/api-catalogos` | 3, 4 | `src/clientes/**`, `src/usuarios/**`, `src/metricas/**`, `tests/catalogos.test.ts` | Tercero |
| **WP9** | Rotativo (el que no haya hecho WP7) | `feature/contrato-fase2` | 9, 10 + QA final | `backend/openapi.yaml`, `backend/postman/`, `docs/API_CONTRACT.md`, `docs/evidencias/fase-2/` | El autor de WP7 |

**Nota sobre roles:** Hugo (B) es normalmente Android, pero aquí toma catálogos/métricas y revisa WP7; Tercero (C) toma la infraestructura de datos y la documentación. Así se cumple el reparto *“2 commits por integrante por semana y participación en 2+ áreas”* (§6.3).

### Orden de merge (importante)

```text
CopiaHugo (a98bf)
  └─ WP6 datos-seguros   → CopiaHugo   (storage + reglas + migración)
       └─ WP7 api-minutas   → CopiaHugo   (necesita src/config/storage.ts)
            └─ WP8 api-catalogos → CopiaHugo
                 └─ WP9 contrato/QA → CopiaHugo
                      └─ tag v0.3.0-fase2
```

WP6 va primero porque WP7 importa la abstracción de Storage. Si dos ramas tocan `app.ts`, gana WP7 (Bryan es el único que lo edita).

---

## 4. Modelo de datos objetivo (sección 3.4 del plan original)

```text
usuarios/{uid}  { nombre, email, rol: "operador"|"gerente", activo, fechaAlta,
                  proveedor, ultimoAcceso }        # sin contrasena
clientes/{id}   { nombre, direccion, contacto, activo }
minutas/{id}    { vendedorId, vendedorNombre, clienteId, clienteNombre,
                  fecha, hora,
                  actividades: { talachear, semaforear, recolectarDesecho,
                                 recolectarRenovado },
                  detalles, estatus: "Pendiente"|"Autorizado"|"Rechazado",
                  fotoUrl, resumenIA, createdAt, updatedAt, syncOrigen }
eventos/{id}    { tipo, minutaId, payload, consumidoEn, createdAt }   # Fase 5
```

### Adaptadores de compatibilidad (WP6)

Mientras Android y web siguen leyendo Firestore directo, los documentos se escriben con **campos nuevos y viejos a la vez**:

| Campo objetivo | Campo real actual | Regla |
|---|---|---|
| `clienteNombre` | `cliente` | copia directa |
| `clienteId` | `cliente` | buscar en `clientes` por `nombreEmpresa`; si no hay, `null` |
| `vendedorNombre` | `vendedor` | copia directa |
| `vendedorId` | `vendedor` | buscar en `usuarios` por `nombre`; si no hay, `null` |
| `direccion` | `ciudad` | copia directa (se conservan todos los campos viejos) |
| `contacto` | `contactoPrincipal` | copia directa |
| `fotoUrl` | `fotoBase64` | subir a Storage y guardar URL; conservar `fotoBase64` hasta Fase 3 |
| `ubicacion` | `latitud, longitud, ubicacionTexto` | agrupar si existen; opcional |

`resumenIA` y `eventos` quedan para Fase 5; se dejan vacíos/no se crean.

### Migración de usuarios (WP6, tarea 8)

Los 3 usuarios viejos **no tienen `email` ni `uid` de Firebase Auth**, así que no se pueden convertir en cuentas Google automáticamente:

- Exportar backup primero (§10).
- Quitar `contrasena` de los 3 documentos.
- Marcarlos `activo: false`, `migrado: false`, `proveedor: "legacy"`.
- **No borrarlos**: el historial de minutas los referencia por nombre.
- Los usuarios nuevos siguen creándose por `uid` con el flujo de Fase 1, que ya respeta roles.

---

## 5. Endpoints a implementar (sección 3.3 del plan original)

| Método | Ruta | Rol | WP |
|---|---|---|---|
| GET | `/api/v1/minutas` | autenticado | WP7 |
| POST | `/api/v1/minutas` | operador | WP7 |
| GET | `/api/v1/minutas/{id}` | autenticado | WP7 |
| PATCH | `/api/v1/minutas/{id}/estatus` | gerente | WP7 |
| POST | `/api/v1/minutas/{id}/foto` | operador | WP7 |
| GET | `/api/v1/clientes` | autenticado | WP8 |
| POST | `/api/v1/clientes` | gerente | WP8 |
| PATCH | `/api/v1/clientes/{id}` | gerente | WP8 |
| DELETE | `/api/v1/clientes/{id}` | gerente (baja lógica) | WP8 |
| GET | `/api/v1/usuarios` | gerente | WP8 |
| POST | `/api/v1/usuarios` | gerente | WP8 |
| DELETE | `/api/v1/usuarios/{id}` | gerente (baja lógica) | WP8 |
| GET | `/api/v1/metricas/resumen` | gerente | WP8 |

Los endpoints de Fase 1 (`/health`, `/auth/google`, `/auth/me`) no se tocan.

---

## 6. Detalle por WP

### WP6 — Datos seguros (Tercero)

- `src/config/storage.ts`: `getStorage()` modular de `firebase-admin/storage`, lazy, igual patrón que `config/firebase.ts`.
- `firestore.rules`: `allow read, write: if false` para todos los documentos; el backend usa Admin SDK y no está sujeto a reglas.
- `storage.rules`: lectura pública de `fotos/`, escritura solo desde Admin SDK.
- `firebase.json`: apunta a `firestore.rules`, `storage.rules` e `firestore.indexes.json`.
- `firestore.indexes.json`: índices compuestos para `minutas` por `estatus + fecha`, `clienteId + fecha` y `vendedorId + fecha`.
- `scripts/migrar-datos.ts`: backup → normalizar minutas → extraer `fotoBase64` a Storage → sanear usuarios. Idempotente y con modo `--dry-run`.
- `docs/MODELO_DATOS.md`: colecciones, campos, adaptadores y decisión de activación de reglas.

**Verificación:** `npm run typecheck`, `npm test`, script en `--dry-run` sin escribir, reglas compiladas con `firebase emulators:exec` si está disponible; si no, validación estática del JSON.

### WP7 — API de minutas (Bryan)

- Repositorio con interfaz `MinutasRepository` + implementación Firestore, inyectable en tests.
- Esquemas Zod para body y query (`page`, `limit`, `estatus`, `cliente`, `vendedor`, `fechaDesde`, `fechaHasta`, `orderBy`).
- Respuesta de lista con `{ items, meta: { page, limit, total, totalPages } }`.
- `PATCH estatus`: transición permitida `Pendiente → Autorizado|Rechazado`; cualquier otro origen o destino → `409 CONFLICT`.
- `POST foto`: `multer` en memoria, máximo 5 MB, tipos JPEG/PNG/WebP → Storage → `fotoUrl`.
- Tests con repositorio falso: 401 sin token, 403 operador en `PATCH`, 400 body inválido, 409 transición inválida, 200 con gerente.

**Verificación:** `typecheck`, `build`, `npm test` (nuevo archivo de tests) y curl contra el servidor local.

### WP8 — Catálogos y métricas (Hugo)

- Repositorios `ClientesRepository` y `UsuariosRepository` ampliado (baja lógica = `activo: false`, nunca `delete()`).
- `GET /usuarios` y `/metricas/resumen` con `requireRol("gerente")`.
- `metricas/resumen`: totales por estatus, por cliente y por día, calculados desde `minutas`.
- Tests con repositorios falsos, sin Firebase.

**Verificación:** `typecheck`, `build`, `npm test` y comprobación de que un operador recibe 403 en `/usuarios` y `/metricas`.

### WP9 — Contrato, Postman y QA (rotativo)

- Ampliar `openapi.yaml` con los 13 endpoints nuevos, esquemas `Minuta`, `Cliente`, `Metricas`, `Paginacion`, errores `409` y ejemplos.
- Colección Postman con carpetas `Minutas`, `Catalogos`, `Metricas`, `Negativos`; variables `baseUrl`, `token`, `minutaId`.
- Actualizar `docs/API_CONTRACT.md` con la nueva sección de negocio.
- Evidencias en `docs/evidencias/fase-2/`.
- QA final: `typecheck`, `build`, `npm test`, `/docs` en producción, CORS, reglas activas.

---

## 7. Checkpoints y verificación global

Cada WP termina con:

```powershell
cd "C:\Curso Android\SAGO_MINUTAS\backend"
npm run typecheck
npm run build
npm test
```

Checkpoints funcionales de la fase:

| Comprobación | Esperado |
|---|---|
| `GET /api/v1/minutas?page=1&limit=2&estatus=Pendiente` | `200` con `items` y `meta` |
| `POST /api/v1/minutas` sin token | `401` |
| `PATCH /minutas/{id}/estatus` con operador | `403` |
| `PATCH` con gerente y transición válida | `200` |
| `PATCH` con transición inválida | `409` |
| `POST /minutas/{id}/foto` | `200` con `fotoUrl`, objeto en Storage |
| `GET /api/v1/usuarios` con operador | `403` |
| `GET /api/v1/metricas/resumen` con gerente | `200` |
| Escritura directa desde cliente a Firestore | **rechazada** por reglas |
| `npm test` | verde, con tests de minutas y catálogos |
| `/docs` en Render | 13 endpoints nuevos listados |

---

## 8. Definition of Done (Fase 2)

- [ ] CRUD de minutas con filtros, paginación y orden.
- [ ] Cambio de estatus con rol y transición validada.
- [ ] CRUD de clientes y usuarios con baja lógica.
- [ ] `GET /metricas/resumen`.
- [ ] Subida de foto a Storage con `fotoUrl`.
- [ ] `firestore.rules`, `storage.rules`, `firebase.json` e índices compuestos.
- [ ] Datos migrados: sin `contrasena`, fotos en Storage, backup exportado.
- [ ] Swagger y Postman ampliados; `API_CONTRACT.md` actualizado.
- [ ] Los 3 integrantes con commits y revisiones cruzadas.
- [ ] Tests y typecheck en verde; reglas activas verificadas.
- [ ] Tag `v0.3.0-fase2`.

---

## 9. Primeros comandos para arrancar

```powershell
# Desde la raíz del repo, sobre la punta de Fase 1
git switch CopiaHugo
git pull origin CopiaHugo
git switch -c feature/datos-seguros      # WP6 - Tercero

# WP7 y WP8 se crean DESPUÉS de mergear WP6:
git switch CopiaHugo
git switch -c feature/api-minutas        # Bryan
git switch CopiaHugo
git switch -c feature/api-catalogos      # Hugo
```

---

## 10. Qué NO se hace en esta fase

- No se toca Android ni el panel web (Fases 3 y 6).
- No se agrega Room, WorkManager ni modo offline (Fase 4).
- No se agrega Gemini ni RabbitMQ (Fase 5).
- No se agrega CI/CD ni traducciones (Fase 6).
- No se pushea a `master` ni se reescribe historial.
- No se versionan `.env`, service accounts ni tokens.
