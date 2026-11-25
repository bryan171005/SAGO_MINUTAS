/**
 * Migracion de datos de la Fase 2 (WP6).
 *
 * Uso:
 *   npx tsx scripts/migrar-datos.ts --dry-run   (por defecto: no escribe nada)
 *   npx tsx scripts/migrar-datos.ts --apply     (backup + escrituras reales)
 *
 * El modo --apply necesita FIREBASE_SERVICE_ACCOUNT_BASE64 o credenciales ADC.
 * Si se pasan ambas banderas, gana --dry-run por seguridad.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "../src/config/firebase";
import { getBucket, nombreBucket } from "../src/config/storage";

export const COLECCIONES = ["usuarios", "clientes", "minutas"] as const;
export const CARPETA_FOTOS = "fotos";
export const CARPETA_BACKUPS = "backups";

export interface Indices {
  clientes: Map<string, string>;
  usuarios: Map<string, string>;
}

export interface DatosFoto {
  base64: string;
  contentType: string;
  extension: string;
}

/** Tipos raster aceptados. SVG se excluye: se servira publicamente desde Storage. */
const TIPOS_IMAGEN: Record<string, { contentType: string; extension: string }> = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  jpg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
  gif: { contentType: "image/gif", extension: "gif" },
  bmp: { contentType: "image/bmp", extension: "bmp" },
  heic: { contentType: "image/heic", extension: "heic" },
  heif: { contentType: "image/heif", extension: "heif" },
};

function texto(valor: unknown): string | undefined {
  if (typeof valor !== "string") {
    return undefined;
  }
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : undefined;
}

function clave(valor: string | undefined): string | undefined {
  return valor?.toLowerCase();
}

/** MIME declarado en la data URL, para reportar fotos omitidas sin exponer su contenido. */
export function mimeDeFoto(valor: unknown): string | undefined {
  const cadena = texto(valor);
  if (!cadena) {
    return undefined;
  }
  return /^data:([^;,]+)/i.exec(cadena)?.[1]?.toLowerCase();
}

/** Convierte un valor `fotoBase64` (data URL o base64 puro) en datos de archivo. */
export function extraerFoto(valor: unknown): DatosFoto | null {
  const cadena = texto(valor);
  if (!cadena) {
    return null;
  }

  const dataUrl = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(cadena);
  const subtipo = dataUrl?.[1]?.toLowerCase() ?? "jpeg";
  const tipo = TIPOS_IMAGEN[subtipo];

  if (!tipo) {
    return null;
  }

  const base64 = (dataUrl?.[2] ?? cadena).replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length === 0) {
    return null;
  }

  return { base64, contentType: tipo.contentType, extension: tipo.extension };
}

/** Campos nuevos a fusionar en una minuta; los campos viejos se conservan. */
export function adaptarMinuta(
  datos: DocumentData,
  indices: Indices,
  ahora = new Date().toISOString(),
): DocumentData {
  const clienteNombre = texto(datos.cliente) ?? texto(datos.clienteNombre);
  const vendedorNombre = texto(datos.vendedor) ?? texto(datos.vendedorNombre);
  const clienteClave = clave(clienteNombre);
  const vendedorClave = clave(vendedorNombre);

  const campos: DocumentData = {
    clienteNombre: clienteNombre ?? null,
    clienteId: (clienteClave && indices.clientes.get(clienteClave)) ?? datos.clienteId ?? null,
    vendedorNombre: vendedorNombre ?? null,
    vendedorId: (vendedorClave && indices.usuarios.get(vendedorClave)) ?? datos.vendedorId ?? null,
  };

  const tieneUbicacion =
    datos.latitud !== undefined || datos.longitud !== undefined || datos.ubicacionTexto !== undefined;

  if (tieneUbicacion) {
    campos.ubicacion = {
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      texto: texto(datos.ubicacionTexto) ?? null,
    };
  }

  if (!texto(datos.createdAt)) {
    campos.createdAt = texto(datos.fecha) ?? ahora;
  }
  if (!texto(datos.updatedAt)) {
    campos.updatedAt = ahora;
  }

  return campos;
}

/** Campos nuevos de un cliente; conserva nombreEmpresa, ciudad y contactoPrincipal. */
export function adaptarCliente(datos: DocumentData): DocumentData {
  const campos: DocumentData = {};
  const nombre = texto(datos.nombreEmpresa);
  const ciudad = texto(datos.ciudad);
  const contacto = texto(datos.contactoPrincipal);

  if (nombre && !texto(datos.nombre)) {
    campos.nombre = nombre;
  }
  if (ciudad && !texto(datos.direccion)) {
    campos.direccion = ciudad;
  }
  if (contacto && !texto(datos.contacto)) {
    campos.contacto = contacto;
  }
  if (typeof datos.activo !== "boolean") {
    campos.activo = true;
  }

  return campos;
}

/** Usuarios legacy: sin uid de Firebase Auth y con contrasena en texto plano. */
export function adaptarUsuarioLegacy(datos: DocumentData): { campos: DocumentData; borrar: string[] } | null {
  if (texto(datos.uid) || !texto(datos.contrasena)) {
    return null;
  }

  return {
    campos: { activo: false, migrado: false, proveedor: "legacy" },
    borrar: ["contrasena"],
  };
}

/** URL que sirve el contenido a traves de las reglas publicas de Firebase Storage. */
export function urlPublica(bucket: string, ruta: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(ruta)}?alt=media`;
}

function construirIndices(snapshots: Record<(typeof COLECCIONES)[number], QueryDocumentSnapshot[]>): Indices {
  const clientes = new Map<string, string>();
  const usuarios = new Map<string, string>();

  for (const doc of snapshots.clientes) {
    const nombre = clave(texto(doc.data().nombreEmpresa));
    if (nombre && !clientes.has(nombre)) {
      clientes.set(nombre, doc.id);
    }
  }

  for (const doc of snapshots.usuarios) {
    const nombre = clave(texto(doc.data().nombre));
    if (nombre && !usuarios.has(nombre)) {
      usuarios.set(nombre, doc.id);
    }
  }

  return { clientes, usuarios };
}

function exportarBackup(snapshots: Record<(typeof COLECCIONES)[number], QueryDocumentSnapshot[]>): string {
  const destino = join(process.cwd(), CARPETA_BACKUPS, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(destino, { recursive: true });

  for (const coleccion of COLECCIONES) {
    const documentos = snapshots[coleccion].map((doc) => ({ id: doc.id, ...doc.data() }));
    writeFileSync(join(destino, `${coleccion}.json`), JSON.stringify(documentos, null, 2), "utf8");
  }

  return destino;
}

async function ejecutar(): Promise<void> {
  const aplicar = process.argv.includes("--apply");
  const soloLectura = !aplicar || process.argv.includes("--dry-run");
  const prefijo = soloLectura ? "[dry-run] " : "";

  console.log(`== Migracion Fase 2 (WP6) == ${soloLectura ? "SOLO LECTURA" : "APLICANDO CAMBIOS"}`);

  const db = getDb();
  const snapshots: Record<(typeof COLECCIONES)[number], QueryDocumentSnapshot[]> = {
    usuarios: [],
    clientes: [],
    minutas: [],
  };

  for (const coleccion of COLECCIONES) {
    snapshots[coleccion] = (await db.collection(coleccion).get()).docs;
    console.log(`${prefijo}leidos ${snapshots[coleccion].length} documentos de ${coleccion}`);
  }

  const backup = soloLectura ? null : exportarBackup(snapshots);
  if (backup) {
    console.log(`backup exportado en ${backup}`);
  }

  const indices = construirIndices(snapshots);
  const bucket = nombreBucket();
  let minutasNormalizadas = 0;
  let clientesNormalizados = 0;
  let fotosSubidas = 0;
  let fotosPendientes = 0;
  let fotosOmitidas = 0;
  let usuariosSaneados = 0;

  for (const doc of snapshots.minutas) {
    const datos = doc.data();
    const campos = adaptarMinuta(datos, indices);
    const foto = extraerFoto(datos.fotoBase64);

    if (!foto && texto(datos.fotoBase64) && !texto(datos.fotoUrl)) {
      fotosOmitidas += 1;
      console.warn(
        `${prefijo}foto omitida en minuta ${doc.id}: ` +
          `${mimeDeFoto(datos.fotoBase64) ?? "base64 no reconocido"}`,
      );
    }

    if (foto && !texto(datos.fotoUrl)) {
      const ruta = `${CARPETA_FOTOS}/${doc.id}.${foto.extension}`;
      campos.fotoUrl = urlPublica(bucket, ruta);

      if (soloLectura) {
        fotosPendientes += 1;
      } else {
        await getBucket()
          .file(ruta)
          .save(Buffer.from(foto.base64, "base64"), {
            contentType: foto.contentType,
            metadata: { cacheControl: "public, max-age=31536000" },
          });
        fotosSubidas += 1;
      }
    }

    if (!soloLectura) {
      await doc.ref.set(campos, { merge: true });
    }
    minutasNormalizadas += 1;
  }

  for (const doc of snapshots.clientes) {
    const campos = adaptarCliente(doc.data());
    if (Object.keys(campos).length === 0) {
      continue;
    }
    if (!soloLectura) {
      await doc.ref.set(campos, { merge: true });
    }
    clientesNormalizados += 1;
  }

  for (const doc of snapshots.usuarios) {
    const adaptado = adaptarUsuarioLegacy(doc.data());
    if (!adaptado) {
      continue;
    }

    if (!soloLectura) {
      const actualizacion: DocumentData = { ...adaptado.campos };
      for (const campo of adaptado.borrar) {
        actualizacion[campo] = FieldValue.delete();
      }
      await doc.ref.set(actualizacion, { merge: true });
    }
    usuariosSaneados += 1;
  }

  const resumenFotos = soloLectura
    ? `${fotosPendientes} fotos pendientes de subir`
    : `${fotosSubidas} fotos subidas`;

  console.log(
    `${prefijo}resumen: ${minutasNormalizadas} minutas normalizadas, ` +
      `${clientesNormalizados} clientes normalizados, ${resumenFotos}, ` +
      `${fotosOmitidas} fotos omitidas, ${usuariosSaneados} usuarios saneados`,
  );

  if (soloLectura) {
    console.log(`${prefijo}No se escribio nada. Para aplicar: npx tsx scripts/migrar-datos.ts --apply`);
  }
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  ejecutar().catch((error: unknown) => {
    console.error("[migrar-datos] fallo la migracion:", error);
    process.exitCode = 1;
  });
}
