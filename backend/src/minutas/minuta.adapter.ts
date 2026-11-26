import {
  ESTATUS_MINUTA,
  type ActividadesMinuta,
  type DatosNuevaMinuta,
  type EstatusMinuta,
  type Minuta,
  type UbicacionMinuta,
  type UsuarioCreador,
} from "./minuta.types";

/** Firestore devuelve DocumentData; en las capas puras usamos un tipo simple. */
type Datos = Record<string, unknown>;

const CLAVES_ACTIVIDAD = [
  "talachear",
  "semaforear",
  "recolectarDesecho",
  "recolectarRenovado",
] as const;

function texto(valor: unknown): string | undefined {
  if (typeof valor !== "string") {
    return undefined;
  }
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : undefined;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function objeto(valor: unknown): Datos {
  return typeof valor === "object" && valor !== null ? (valor as Datos) : {};
}

function validarPartes(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
    return null;
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fecha.getUTCFullYear() !== anio ||
    fecha.getUTCMonth() !== mes - 1 ||
    fecha.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${anio.toString().padStart(4, "0")}-${mes.toString().padStart(2, "0")}-${dia
    .toString()
    .padStart(2, "0")}`;
}

/** Acepta `dd/mm/yyyy` (legado) y `yyyy-mm-dd` / ISO; devuelve `yyyy-mm-dd`. */
export function aISOFecha(valor: unknown): string | null {
  const cadena = texto(valor);
  if (!cadena) {
    return null;
  }

  const legado = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cadena);
  if (legado) {
    return validarPartes(Number(legado[3]), Number(legado[2]), Number(legado[1]));
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(cadena);
  if (iso) {
    return validarPartes(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  return null;
}

/** Convierte `yyyy-mm-dd` al formato que Android/web ya saben leer. */
export function aFechaLegacy(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : iso;
}

export function normalizarHora(valor: unknown): string {
  const cadena = texto(valor);
  if (!cadena) {
    return "00:00:00";
  }
  const partes = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(cadena);
  if (!partes) {
    return "00:00:00";
  }
  const horas = Number(partes[1]);
  const minutos = Number(partes[2]);
  const segundos = Number(partes[3] ?? "0");
  if (horas > 23 || minutos > 59 || segundos > 59) {
    return "00:00:00";
  }
  return [horas, minutos, segundos].map((n) => n.toString().padStart(2, "0")).join(":");
}

export function normalizarEstatus(valor: unknown): EstatusMinuta {
  return ESTATUS_MINUTA.find((estatus) => estatus === valor) ?? "Pendiente";
}

export function normalizarActividades(valor: unknown): ActividadesMinuta {
  const datos = objeto(valor);
  const actividades = {} as ActividadesMinuta;
  for (const clave of CLAVES_ACTIVIDAD) {
    actividades[clave] = datos[clave] === true;
  }
  return actividades;
}

export function normalizarUbicacion(datos: Datos): UbicacionMinuta | null {
  const ubicacion = objeto(datos.ubicacion);
  const latitud = numero(datos.latitud ?? ubicacion.latitud);
  const longitud = numero(datos.longitud ?? ubicacion.longitud);
  const textoUbicacion = texto(datos.ubicacionTexto ?? ubicacion.texto);
  if (latitud === null && longitud === null && !textoUbicacion) {
    return null;
  }
  return { latitud, longitud, texto: textoUbicacion ?? null };
}

export function normalizarMinuta(id: string, datos: Datos): Minuta {
  const fechaISO = aISOFecha(datos.fechaISO ?? datos.fecha);
  const cliente = texto(datos.clienteNombre) ?? texto(datos.cliente) ?? null;
  const vendedor = texto(datos.vendedorNombre) ?? texto(datos.vendedor) ?? null;

  return {
    id,
    cliente,
    vendedor,
    clienteId: texto(datos.clienteId) ?? null,
    clienteNombre: cliente,
    vendedorId: texto(datos.vendedorId) ?? null,
    vendedorNombre: vendedor,
    fecha: fechaISO ? aFechaLegacy(fechaISO) : (texto(datos.fecha) ?? ""),
    fechaISO,
    hora: normalizarHora(datos.hora),
    detalles: texto(datos.detalles) ?? "",
    actividades: normalizarActividades(datos.actividades),
    estatus: normalizarEstatus(datos.estatus),
    fotoUrl: texto(datos.fotoUrl) ?? null,
    ubicacion: normalizarUbicacion(datos),
    createdAt: texto(datos.createdAt) ?? texto(datos.fecha) ?? "",
    updatedAt: texto(datos.updatedAt) ?? texto(datos.createdAt) ?? "",
  };
}

/**
 * Escribe campos nuevos y viejos en el mismo documento. Android y web siguen
 * leyendo Firestore directo durante Fase 2, asi que no podemos romperlos.
 */
export function serializarMinuta(
  datos: DatosNuevaMinuta,
  usuario: UsuarioCreador,
  ahora: string,
): Datos {
  const fechaISO = aISOFecha(datos.fecha);
  if (!fechaISO) {
    throw new Error("Fecha de minuta invalida");
  }

  const documento: Datos = {
    // Campos legacy (compatibilidad temporal con Android/web).
    cliente: datos.cliente.trim(),
    vendedor: datos.vendedor.trim(),
    fecha: aFechaLegacy(fechaISO),
    hora: normalizarHora(datos.hora),
    detalles: datos.detalles.trim(),
    actividades: normalizarActividades(datos.actividades),
    estatus: "Pendiente",
    // Campos nuevos de Fase 2.
    clienteId: datos.clienteId?.trim() || null,
    clienteNombre: datos.cliente.trim(),
    vendedorId: datos.vendedorId?.trim() || null,
    vendedorNombre: datos.vendedor.trim(),
    fechaISO,
    creadoPor: usuario.uid,
    createdAt: ahora,
    updatedAt: ahora,
    fotoUrl: null,
  };

  const tieneUbicacion =
    datos.latitud !== undefined || datos.longitud !== undefined || texto(datos.ubicacionTexto);

  if (tieneUbicacion) {
    documento.latitud = datos.latitud ?? null;
    documento.longitud = datos.longitud ?? null;
    documento.ubicacionTexto = texto(datos.ubicacionTexto) ?? null;
    documento.ubicacion = {
      latitud: datos.latitud ?? null,
      longitud: datos.longitud ?? null,
      texto: texto(datos.ubicacionTexto) ?? null,
    };
  }

  return documento;
}

export function serializarCambioEstatus(estatus: EstatusMinuta, ahora: string): Datos {
  return { estatus, updatedAt: ahora };
}

export function serializarFotoUrl(fotoUrl: string, ahora: string): Datos {
  return { fotoUrl, updatedAt: ahora };
}
