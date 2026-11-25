import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adaptarCliente,
  adaptarMinuta,
  adaptarUsuarioLegacy,
  extraerFoto,
  mimeDeFoto,
  urlPublica,
  type Indices,
} from "../scripts/migrar-datos";
import { env } from "../src/config/env";
import { getBucket, nombreBucket } from "../src/config/storage";

/** Ruta del directorio backend, con independencia del cwd desde el que se ejecute vitest. */
const raizBackend = dirname(dirname(fileURLToPath(import.meta.url)));

function leer(nombre: string): string {
  return readFileSync(join(raizBackend, nombre), "utf8");
}

function leerJson<T>(nombre: string): T {
  return JSON.parse(leer(nombre)) as T;
}

interface ConfigFirebase {
  firestore: { rules: string; indexes: string };
  storage: { rules: string };
}

interface Indice {
  collectionGroup: string;
  fields: Array<{ fieldPath: string; order: string }>;
}

interface DocumentoIndices {
  indexes: Indice[];
}

describe("configuracion de reglas e indices", () => {
  it("firebase.json apunta a archivos que existen", () => {
    const configuracion = leerJson<ConfigFirebase>("firebase.json");

    expect(existsSync(join(raizBackend, configuracion.firestore.rules))).toBe(true);
    expect(existsSync(join(raizBackend, configuracion.firestore.indexes))).toBe(true);
    expect(existsSync(join(raizBackend, configuracion.storage.rules))).toBe(true);
  });

  it("Firestore deniega todo acceso desde el cliente", () => {
    expect(leer("firestore.rules")).toContain("allow read, write: if false");
  });

  it("Storage permite leer fotos pero no escribir desde el cliente", () => {
    const reglas = leer("storage.rules");
    expect(reglas).toContain("match /fotos/{fileName}");
    expect(reglas).toContain("allow read: if true");
    expect(reglas).toContain("allow write: if false");
  });

  it("los indices compuestos cubren estatus, cliente y vendedor por fecha", () => {
    const { indexes } = leerJson<DocumentoIndices>("firestore.indexes.json");
    const pares = indexes
      .filter((indice) => indice.collectionGroup === "minutas")
      .map((indice) => indice.fields.map((campo) => campo.fieldPath).join("+"));

    expect(pares).toEqual(
      expect.arrayContaining(["estatus+fecha", "clienteId+fecha", "vendedorId+fecha"]),
    );
  });
});

describe("bucket de Storage", () => {
  it("resuelve el bucket sin depender de storageBucket en la app", () => {
    const esperado =
      env.FIREBASE_STORAGE_BUCKET.trim() || `${env.FIREBASE_PROJECT_ID}.appspot.com`;

    expect(nombreBucket()).toBe(esperado);
    expect(() => getBucket()).not.toThrow();
    expect(getBucket().name).toBe(esperado);
  });
});

const indices: Indices = {
  clientes: new Map([["acme", "cli-1"]]),
  usuarios: new Map([["juan", "usr-1"]]),
};

describe("adaptadores de migracion", () => {
  it("agrega campos nuevos a una minuta sin perder los viejos", () => {
    const campos = adaptarMinuta(
      {
        cliente: "Acme",
        vendedor: "Juan",
        fecha: "2026-11-20",
        latitud: 19.43,
        fotoBase64: "aGVsbG8=",
      },
      indices,
      "2026-11-24T00:00:00.000Z",
    );

    expect(campos).toMatchObject({
      clienteNombre: "Acme",
      clienteId: "cli-1",
      vendedorNombre: "Juan",
      vendedorId: "usr-1",
      createdAt: "2026-11-20",
      updatedAt: "2026-11-24T00:00:00.000Z",
    });
    expect(campos.ubicacion).toEqual({ latitud: 19.43, longitud: null, texto: null });
  });

  it("deja referencias en null cuando no encuentra cliente ni vendedor", () => {
    const campos = adaptarMinuta({ cliente: "Desconocido", vendedor: "Nadie" }, indices);

    expect(campos.clienteId).toBeNull();
    expect(campos.vendedorId).toBeNull();
  });

  it("extrae foto de una data URL png y de un base64 puro", () => {
    expect(extraerFoto("data:image/png;base64,aGVsbG8=")).toEqual({
      base64: "aGVsbG8=",
      contentType: "image/png",
      extension: "png",
    });
    expect(extraerFoto("aGVsbG8=")).toMatchObject({
      contentType: "image/jpeg",
      extension: "jpg",
    });
    expect(extraerFoto("no-es-base64")).toBeNull();
    expect(extraerFoto(undefined)).toBeNull();
  });

  it("normaliza alias de MIME y acepta formatos raster adicionales", () => {
    expect(extraerFoto("data:image/jpg;base64,aGVsbG8=")).toEqual({
      base64: "aGVsbG8=",
      contentType: "image/jpeg",
      extension: "jpg",
    });
    expect(extraerFoto("data:image/gif;base64,aGVsbG8=")).toMatchObject({
      contentType: "image/gif",
      extension: "gif",
    });
  });

  it("rechaza SVG y tipos no raster que se serviran publicamente", () => {
    expect(extraerFoto("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(extraerFoto("data:application/pdf;base64,aGVsbG8=")).toBeNull();
  });

  it("reporta el MIME sin exponer el contenido base64", () => {
    expect(mimeDeFoto("data:image/JPG;base64,aGVsbG8=")).toBe("image/jpg");
    expect(mimeDeFoto("aGVsbG8=")).toBeUndefined();
    expect(mimeDeFoto(undefined)).toBeUndefined();
  });

  it("normaliza clientes y es idempotente", () => {
    const original = { nombreEmpresa: "Acme", ciudad: "CDMX", contactoPrincipal: "Juan" };
    const campos = adaptarCliente(original);

    expect(campos).toMatchObject({ nombre: "Acme", direccion: "CDMX", contacto: "Juan", activo: true });
    expect(adaptarCliente({ ...original, ...campos })).toEqual({});
  });

  it("sanea usuarios legacy y respeta los de Google", () => {
    const legacy = adaptarUsuarioLegacy({ nombre: "Pedro", contrasena: "1234", rol: "operador" });
    expect(legacy).toEqual({
      campos: { activo: false, migrado: false, proveedor: "legacy" },
      borrar: ["contrasena"],
    });

    expect(adaptarUsuarioLegacy({ uid: "abc", email: "a@b.com", contrasena: "1234" })).toBeNull();
    expect(adaptarUsuarioLegacy({ nombre: "Pedro", activo: false, proveedor: "legacy" })).toBeNull();
  });

  it("construye una URL publica con la ruta codificada", () => {
    expect(urlPublica("sago-minutas.appspot.com", "fotos/minuta-1.jpg")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/sago-minutas.appspot.com/o/fotos%2Fminuta-1.jpg?alt=media",
    );
  });
});
