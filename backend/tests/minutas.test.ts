import express from "express";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { TokenVerificado } from "../src/auth/auth.service";
import { crearMiddlewareAuth, crearRequiereRol } from "../src/middlewares/auth";
import { errorHandler } from "../src/middlewares/error";
import {
  aFechaLegacy,
  aISOFecha,
  normalizarMinuta,
  serializarMinuta,
} from "../src/minutas/minuta.adapter";
import { uploadFoto } from "../src/minutas/minuta.storage";
import { crearMinutasController } from "../src/minutas/minutas.controller";
import { crearMinutasRouter } from "../src/minutas/minutas.routes";
import {
  crearMinutasService,
  filtrarMinutas,
  ordenarMinutas,
  paginarMinutas,
} from "../src/minutas/minutas.service";
import {
  ConflictoTransicionError,
  type ArchivoFoto,
  type FiltrosMinutas,
  type Minuta,
  type MinutasRepository,
  type SubidorFotos,
} from "../src/minutas/minuta.types";
import type { UsuariosRepository } from "../src/usuarios/usuarios.repository";
import type { RolUsuario } from "../src/usuarios/usuario.types";

const AHORA = "2026-11-25T12:00:00.000Z";
const TOKEN = "token-valido-de-prueba";
const BEARER = { Authorization: `Bearer ${TOKEN}` };

function minutaBase(id: string, cambios: Partial<Minuta> = {}): Minuta {
  return {
    id,
    cliente: "Fersa",
    vendedor: "Bryan",
    clienteId: null,
    clienteNombre: "Fersa",
    vendedorId: null,
    vendedorNombre: "Bryan",
    fecha: "15/11/2026",
    fechaISO: "2026-11-15",
    hora: "10:30:00",
    detalles: "Visita",
    actividades: {
      talachear: true,
      semaforear: false,
      recolectarDesecho: false,
      recolectarRenovado: false,
    },
    estatus: "Pendiente",
    fotoUrl: null,
    ubicacion: null,
    createdAt: AHORA,
    updatedAt: AHORA,
    ...cambios,
  };
}

const CUERPO_VALIDO = {
  cliente: "Fersa",
  vendedor: "Bryan",
  fecha: "25/11/2026",
  hora: "09:15",
  detalles: "Revision",
  actividades: {
    talachear: true,
    semaforear: false,
    recolectarDesecho: true,
    recolectarRenovado: false,
  },
};

/** Repositorio en memoria: simula la transaccion y cuenta escrituras. */
function crearRepoFalso(inicial: Minuta[] = []) {
  const docs = new Map(inicial.map((minuta) => [minuta.id, { ...minuta }]));
  const escrituras = { crear: 0, estatus: 0, foto: 0 };
  let contador = 0;
  let conflictoConcurrente = false;

  const repo: MinutasRepository = {
    async crear(datos, usuario, ahora) {
      escrituras.crear += 1;
      const id = `m${++contador}`;
      const guardada = normalizarMinuta(id, serializarMinuta(datos, usuario, ahora));
      docs.set(id, guardada);
      return guardada;
    },
    async obtenerPorId(id) {
      const minuta = docs.get(id);
      return minuta ? { ...minuta } : null;
    },
    async listar() {
      return [...docs.values()].map((minuta) => ({ ...minuta }));
    },
    async actualizarEstatus(id, estatus, ahora) {
      const actual = docs.get(id);
      if (!actual) {
        return null;
      }
      if (conflictoConcurrente) {
        throw new ConflictoTransicionError("cambio concurrente");
      }
      if (actual.estatus !== "Pendiente") {
        throw new ConflictoTransicionError("la minuta ya fue resuelta");
      }
      escrituras.estatus += 1;
      const actualizada = { ...actual, estatus, updatedAt: ahora };
      docs.set(id, actualizada);
      return actualizada;
    },
    async guardarFotoUrl(id, fotoUrl, ahora) {
      const actual = docs.get(id);
      if (!actual) {
        return null;
      }
      escrituras.foto += 1;
      const actualizada = { ...actual, fotoUrl, updatedAt: ahora };
      docs.set(id, actualizada);
      return actualizada;
    },
  };

  return {
    repo,
    docs,
    escrituras,
    forzarConflicto: () => {
      conflictoConcurrente = true;
    },
  };
}

function crearSubidorFalso() {
  const llamadas: Array<{ id: string; archivo: ArchivoFoto }> = [];
  const subidor: SubidorFotos = {
    async subir(id, archivo) {
      llamadas.push({ id, archivo });
      return `https://storage.test/fotos/${id}.png?alt=media`;
    },
  };
  return { subidor, llamadas };
}

function crearUsuariosFalsos(rol: RolUsuario | undefined): UsuariosRepository {
  const perfil = { uid: "u1", email: "user@test.com", rol, activo: true };
  return {
    async obtenerPorUid() {
      return perfil;
    },
    async guardar() {},
  };
}

async function verificar(token: string): Promise<TokenVerificado> {
  if (token !== TOKEN) {
    throw new Error("token invalido");
  }
  return { uid: "u1", email: "user@test.com", name: "Usuario" };
}

interface OpcionesApp {
  minutas?: Minuta[];
  rol?: RolUsuario;
  sinRol?: boolean;
}

function crearApp(opciones: OpcionesApp = {}) {
  const falso = crearRepoFalso(opciones.minutas);
  const subida = crearSubidorFalso();
  const service = crearMinutasService({ repositorio: falso.repo, ahora: () => AHORA });
  const controller = crearMinutasController({ service, subirFoto: subida.subidor });
  const rol = opciones.sinRol ? undefined : (opciones.rol ?? "operador");
  const router = crearMinutasRouter({
    requiereAuth: crearMiddlewareAuth({ verificarIdToken: verificar }),
    requireRol: crearRequiereRol({ usuarios: crearUsuariosFalsos(rol) }),
    controller,
    subirFoto: uploadFoto.single("foto"),
  });

  const app: Express = express();
  app.use(express.json());
  app.use("/api/v1/minutas", router);
  app.use(errorHandler);

  return { app, ...falso, ...subida };
}

describe("GET /api/v1/minutas", () => {
  it("sin token responde 401", async () => {
    const { app } = crearApp();
    const res = await request(app).get("/api/v1/minutas");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("con token devuelve items y meta de paginacion", async () => {
    const { app } = crearApp({
      minutas: [
        minutaBase("a", { fecha: "15/11/2026", fechaISO: "2026-11-15" }),
        minutaBase("b", { fecha: "20/11/2026", fechaISO: "2026-11-20" }),
      ],
    });
    const res = await request(app).get("/api/v1/minutas").set(BEARER);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it("filtra por estatus", async () => {
    const { app } = crearApp({
      minutas: [
        minutaBase("a"),
        minutaBase("b", { estatus: "Autorizado" }),
        minutaBase("c", { estatus: "Rechazado" }),
      ],
    });
    const res = await request(app).get("/api/v1/minutas?estatus=Autorizado").set(BEARER);

    expect(res.status).toBe(200);
    expect(res.body.items.map((m: Minuta) => m.id)).toEqual(["b"]);
    expect(res.body.meta.total).toBe(1);
  });

  it("filtra cliente sin distinguir mayusculas", async () => {
    const { app } = crearApp({
      minutas: [minutaBase("a"), minutaBase("b", { cliente: "Setramex", clienteNombre: "Setramex" })],
    });
    const res = await request(app).get("/api/v1/minutas?cliente=fersa").set(BEARER);

    expect(res.status).toBe(200);
    expect(res.body.items.map((m: Minuta) => m.id)).toEqual(["a"]);
  });

  it("filtra por rango de fechas usando fechaISO", async () => {
    const { app } = crearApp({
      minutas: [
        minutaBase("a", { fecha: "15/11/2026", fechaISO: "2026-11-15" }),
        minutaBase("b", { fecha: "25/11/2026", fechaISO: "2026-11-25" }),
      ],
    });
    const res = await request(app)
      .get("/api/v1/minutas?fechaDesde=20/11/2026&fechaHasta=2026-11-30")
      .set(BEARER);

    expect(res.status).toBe(200);
    expect(res.body.items.map((m: Minuta) => m.id)).toEqual(["b"]);
  });

  it("ordena y pagina de forma estable", async () => {
    const { app } = crearApp({
      minutas: [
        minutaBase("c", { fecha: "25/11/2026", fechaISO: "2026-11-25" }),
        minutaBase("a", { fecha: "15/11/2026", fechaISO: "2026-11-15" }),
        minutaBase("b", { fecha: "20/11/2026", fechaISO: "2026-11-20" }),
      ],
    });
    const res = await request(app)
      .get("/api/v1/minutas?orderBy=fecha&order=asc&page=2&limit=1")
      .set(BEARER);

    expect(res.status).toBe(200);
    expect(res.body.items.map((m: Minuta) => m.id)).toEqual(["b"]);
    expect(res.body.meta).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });
  });

  it("query invalida responde 400 VALIDATION_ERROR", async () => {
    const { app } = crearApp();
    const res = await request(app).get("/api/v1/minutas?limit=0").set(BEARER);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("id inexistente responde 404", async () => {
    const { app } = crearApp();
    const res = await request(app).get("/api/v1/minutas/no-existe").set(BEARER);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ code: "NOT_FOUND", message: "Minuta no encontrada" });
  });
});

describe("POST /api/v1/minutas", () => {
  it("sin token responde 401 y no escribe", async () => {
    const { app, escrituras } = crearApp();
    const res = await request(app).post("/api/v1/minutas").send(CUERPO_VALIDO);

    expect(res.status).toBe(401);
    expect(escrituras.crear).toBe(0);
  });

  it("operador crea minuta en Pendiente con campos compatibles", async () => {
    const { app, escrituras } = crearApp();
    const res = await request(app).post("/api/v1/minutas").set(BEARER).send(CUERPO_VALIDO);

    expect(res.status).toBe(201);
    expect(res.body.minuta).toMatchObject({
      estatus: "Pendiente",
      fecha: "25/11/2026",
      fechaISO: "2026-11-25",
      hora: "09:15:00",
      cliente: "Fersa",
      clienteNombre: "Fersa",
      vendedor: "Bryan",
      vendedorNombre: "Bryan",
    });
    expect(escrituras.crear).toBe(1);
  });

  it("gerente tambien puede crear", async () => {
    const { app } = crearApp({ rol: "gerente" });
    const res = await request(app).post("/api/v1/minutas").set(BEARER).send(CUERPO_VALIDO);

    expect(res.status).toBe(201);
  });

  it("usuario sin rol responde 403", async () => {
    const { app, escrituras } = crearApp({ sinRol: true });
    const res = await request(app).post("/api/v1/minutas").set(BEARER).send(CUERPO_VALIDO);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Rol insuficiente");
    expect(escrituras.crear).toBe(0);
  });

  it("body sin cliente responde 400 y no escribe", async () => {
    const { app, escrituras } = crearApp();
    const { cliente: _cliente, ...incompleto } = CUERPO_VALIDO;
    const res = await request(app).post("/api/v1/minutas").set(BEARER).send(incompleto);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(escrituras.crear).toBe(0);
  });

  it("fecha inexistente responde 400", async () => {
    const { app } = crearApp();
    const res = await request(app)
      .post("/api/v1/minutas")
      .set(BEARER)
      .send({ ...CUERPO_VALIDO, fecha: "31/02/2026" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("fecha");
  });

  it("actividades ausentes se default a false", async () => {
    const { app } = crearApp();
    const { actividades: _actividades, ...sinActividades } = CUERPO_VALIDO;
    const res = await request(app)
      .post("/api/v1/minutas")
      .set(BEARER)
      .send(sinActividades);

    expect(res.status).toBe(201);
    expect(res.body.minuta.actividades).toEqual({
      talachear: false,
      semaforear: false,
      recolectarDesecho: false,
      recolectarRenovado: false,
    });
  });
});

describe("PATCH /api/v1/minutas/:id/estatus", () => {
  it("operador no puede cambiar el estatus (403)", async () => {
    const { app, escrituras } = crearApp({ minutas: [minutaBase("m1")] });
    const res = await request(app)
      .patch("/api/v1/minutas/m1/estatus")
      .set(BEARER)
      .send({ estatus: "Autorizado" });

    expect(res.status).toBe(403);
    expect(escrituras.estatus).toBe(0);
  });

  it("gerente autoriza una minuta Pendiente", async () => {
    const { app, docs, escrituras } = crearApp({
      minutas: [minutaBase("m1")],
      rol: "gerente",
    });
    const res = await request(app)
      .patch("/api/v1/minutas/m1/estatus")
      .set(BEARER)
      .send({ estatus: "Autorizado" });

    expect(res.status).toBe(200);
    expect(res.body.minuta.estatus).toBe("Autorizado");
    expect(docs.get("m1")?.estatus).toBe("Autorizado");
    expect(escrituras.estatus).toBe(1);
  });

  it("minuta ya resuelta responde 409 CONFLICT", async () => {
    const { app, escrituras } = crearApp({
      minutas: [minutaBase("m1", { estatus: "Autorizado" })],
      rol: "gerente",
    });
    const res = await request(app)
      .patch("/api/v1/minutas/m1/estatus")
      .set(BEARER)
      .send({ estatus: "Rechazado" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(escrituras.estatus).toBe(0);
  });

  it("conflicto de transaccion concurrente se traduce a 409", async () => {
    const falso = crearApp({ minutas: [minutaBase("m1")], rol: "gerente" });
    falso.forzarConflicto();
    const res = await request(falso.app)
      .patch("/api/v1/minutas/m1/estatus")
      .set(BEARER)
      .send({ estatus: "Autorizado" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("id inexistente responde 404", async () => {
    const { app } = crearApp({ rol: "gerente" });
    const res = await request(app)
      .patch("/api/v1/minutas/no-existe/estatus")
      .set(BEARER)
      .send({ estatus: "Autorizado" });

    expect(res.status).toBe(404);
  });

  it("estatus no permitido responde 400", async () => {
    const { app } = crearApp({ minutas: [minutaBase("m1")], rol: "gerente" });
    const res = await request(app)
      .patch("/api/v1/minutas/m1/estatus")
      .set(BEARER)
      .send({ estatus: "Pendiente" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/v1/minutas/:id/foto", () => {
  it("sin token responde 401", async () => {
    const { app, llamadas } = crearApp();
    const res = await request(app)
      .post("/api/v1/minutas/m1/foto")
      .attach("foto", Buffer.alloc(16), { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(401);
    expect(llamadas).toHaveLength(0);
  });

  it("sin archivo responde 400", async () => {
    const { app } = crearApp({ minutas: [minutaBase("m1")] });
    const res = await request(app).post("/api/v1/minutas/m1/foto").set(BEARER);

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("El archivo foto es obligatorio");
  });

  it("sube la foto y guarda la URL", async () => {
    const { app, docs, llamadas, escrituras } = crearApp({ minutas: [minutaBase("m1")] });
    const res = await request(app)
      .post("/api/v1/minutas/m1/foto")
      .set(BEARER)
      .attach("foto", Buffer.alloc(64), { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(res.body.minuta.fotoUrl).toBe("https://storage.test/fotos/m1.png?alt=media");
    expect(docs.get("m1")?.fotoUrl).toBe(res.body.minuta.fotoUrl);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].id).toBe("m1");
    expect(escrituras.foto).toBe(1);
  });

  it("tipo no raster responde 415", async () => {
    const { app, llamadas } = crearApp({ minutas: [minutaBase("m1")] });
    const res = await request(app)
      .post("/api/v1/minutas/m1/foto")
      .set(BEARER)
      .attach("foto", Buffer.from("<svg/>"), { filename: "foto.svg", contentType: "image/svg+xml" });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(llamadas).toHaveLength(0);
  });

  it("archivo mayor a 5 MB responde 413", async () => {
    const { app, llamadas } = crearApp({ minutas: [minutaBase("m1")] });
    const res = await request(app)
      .post("/api/v1/minutas/m1/foto")
      .set(BEARER)
      .attach("foto", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "grande.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(llamadas).toHaveLength(0);
  });

  it("minuta inexistente responde 404", async () => {
    const { app } = crearApp();
    const res = await request(app)
      .post("/api/v1/minutas/no-existe/foto")
      .set(BEARER)
      .attach("foto", Buffer.alloc(16), { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(404);
  });
});

describe("adaptadores y helpers puros", () => {
  it("normaliza fechas en ambos sentidos y rechaza fechas inexistentes", () => {
    expect(aISOFecha("25/11/2026")).toBe("2026-11-25");
    expect(aISOFecha("2026-11-25T09:00:00.000Z")).toBe("2026-11-25");
    expect(aISOFecha("31/02/2026")).toBeNull();
    expect(aFechaLegacy("2026-11-25")).toBe("25/11/2026");
  });

  it("serializarMinuta escribe campos viejos y nuevos a la vez", () => {
    const documento = serializarMinuta(
      { ...CUERPO_VALIDO, latitud: 19.5, longitud: -99.1, ubicacionTexto: "Planta Fersa" },
      { uid: "u1" },
      AHORA,
    );

    expect(documento).toMatchObject({
      cliente: "Fersa",
      clienteNombre: "Fersa",
      fecha: "25/11/2026",
      fechaISO: "2026-11-25",
      estatus: "Pendiente",
      creadoPor: "u1",
    });
    expect(documento.ubicacion).toEqual({
      latitud: 19.5,
      longitud: -99.1,
      texto: "Planta Fersa",
    });
  });

  it("normalizarMinuta lee documentos legacy sin campos nuevos", () => {
    const minuta = normalizarMinuta("legacy-1", {
      cliente: "Fersa",
      vendedor: "Bryan",
      fecha: "15/11/2026",
      hora: "10:30:00",
      detalles: "Visita",
      estatus: "Autorizado",
      actividades: { talachear: true },
      latitud: 19.5,
      longitud: -99.1,
      ubicacionTexto: "Planta",
    });

    expect(minuta).toMatchObject({
      id: "legacy-1",
      fechaISO: "2026-11-15",
      estatus: "Autorizado",
      fotoUrl: null,
    });
    expect(minuta.actividades.semaforear).toBe(false);
    expect(minuta.ubicacion?.latitud).toBe(19.5);
  });

  it("filtrar, ordenar y paginar funcionan sin repositorio", () => {
    const filtros: FiltrosMinutas = {
      page: 1,
      limit: 1,
      estatus: "Pendiente",
      orderBy: "fecha",
      order: "asc",
    };
    const items = [
      minutaBase("b", { fecha: "20/11/2026", fechaISO: "2026-11-20" }),
      minutaBase("a", { fecha: "15/11/2026", fechaISO: "2026-11-15" }),
    ];
    const resultado = paginarMinutas(
      ordenarMinutas(filtrarMinutas(items, filtros), filtros),
      filtros,
    );

    expect(resultado.items.map((m) => m.id)).toEqual(["a"]);
    expect(resultado.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });
});
