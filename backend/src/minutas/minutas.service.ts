import { HttpError } from "../middlewares/error";
import { aISOFecha } from "./minuta.adapter";
import { minutasRepository } from "./minutas.repository";
import {
  ConflictoTransicionError,
  ESTATUS_MINUTA,
  type DatosNuevaMinuta,
  type EstatusMinuta,
  type FiltrosMinutas,
  type Minuta,
  type MinutasRepository,
  type ResultadoListaMinutas,
  type UsuarioCreador,
} from "./minuta.types";

export interface DependenciasMinutasService {
  repositorio: MinutasRepository;
  ahora?: () => string;
}

export interface MinutasService {
  crear(datos: DatosNuevaMinuta, usuario: UsuarioCreador): Promise<Minuta>;
  listar(filtros: FiltrosMinutas): Promise<ResultadoListaMinutas>;
  obtener(id: string): Promise<Minuta>;
  cambiarEstatus(id: string, estatus: EstatusMinuta): Promise<Minuta>;
  guardarFotoUrl(id: string, fotoUrl: string): Promise<Minuta>;
}

function contiene(valor: string | null, busqueda: string): boolean {
  return (valor ?? "").toLowerCase().includes(busqueda.toLowerCase());
}

/** Funciones puras exportadas para poder probarlas sin Firestore. */
export function filtrarMinutas(items: Minuta[], filtros: FiltrosMinutas): Minuta[] {
  // Los filtros pueden llegar en dd/mm/yyyy o yyyy-mm-dd; siempre comparamos ISO.
  const desde = aISOFecha(filtros.fechaDesde ?? null);
  const hasta = aISOFecha(filtros.fechaHasta ?? null);

  return items.filter((minuta) => {
    if (filtros.estatus && minuta.estatus !== filtros.estatus) {
      return false;
    }
    if (filtros.cliente && !contiene(minuta.clienteNombre ?? minuta.cliente, filtros.cliente)) {
      return false;
    }
    if (filtros.vendedor && !contiene(minuta.vendedorNombre ?? minuta.vendedor, filtros.vendedor)) {
      return false;
    }
    if (desde && (!minuta.fechaISO || minuta.fechaISO < desde)) {
      return false;
    }
    if (hasta && (!minuta.fechaISO || minuta.fechaISO > hasta)) {
      return false;
    }
    return true;
  });
}

export function ordenarMinutas(items: Minuta[], filtros: FiltrosMinutas): Minuta[] {
  const valorDe = (minuta: Minuta): string | number => {
    if (filtros.orderBy === "hora") {
      return minuta.hora;
    }
    if (filtros.orderBy === "estatus") {
      return ESTATUS_MINUTA.indexOf(minuta.estatus);
    }
    return minuta.fechaISO ?? "";
  };

  const factor = filtros.order === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const va = valorDe(a);
    const vb = valorDe(b);
    if (va < vb) {
      return -1 * factor;
    }
    if (va > vb) {
      return 1 * factor;
    }
    // Desempate estable: indispensable para que la paginacion no repita filas.
    return a.id.localeCompare(b.id);
  });
}

export function paginarMinutas(items: Minuta[], filtros: FiltrosMinutas): ResultadoListaMinutas {
  const total = items.length;
  const inicio = (filtros.page - 1) * filtros.limit;

  return {
    items: items.slice(inicio, inicio + filtros.limit),
    meta: {
      page: filtros.page,
      limit: filtros.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / filtros.limit),
    },
  };
}

export function crearMinutasService({
  repositorio,
  ahora = () => new Date().toISOString(),
}: DependenciasMinutasService): MinutasService {
  return {
    async crear(datos, usuario) {
      return repositorio.crear(datos, usuario, ahora());
    },

    async listar(filtros) {
      const todas = await repositorio.listar();
      return paginarMinutas(ordenarMinutas(filtrarMinutas(todas, filtros), filtros), filtros);
    },

    async obtener(id) {
      const minuta = await repositorio.obtenerPorId(id);
      if (!minuta) {
        throw new HttpError(404, "NOT_FOUND", "Minuta no encontrada");
      }
      return minuta;
    },

    async cambiarEstatus(id, estatus) {
      if (estatus !== "Autorizado" && estatus !== "Rechazado") {
        throw new HttpError(409, "CONFLICT", "Transicion de estatus no permitida");
      }

      const actual = await repositorio.obtenerPorId(id);
      if (!actual) {
        throw new HttpError(404, "NOT_FOUND", "Minuta no encontrada");
      }
      if (actual.estatus !== "Pendiente") {
        throw new HttpError(
          409,
          "CONFLICT",
          `La minuta ya esta ${actual.estatus}; solo se puede cambiar desde Pendiente`,
        );
      }

      try {
        const actualizada = await repositorio.actualizarEstatus(id, estatus, ahora());
        if (!actualizada) {
          throw new HttpError(404, "NOT_FOUND", "Minuta no encontrada");
        }
        return actualizada;
      } catch (error) {
        if (error instanceof ConflictoTransicionError) {
          throw new HttpError(409, "CONFLICT", error.message);
        }
        throw error;
      }
    },

    async guardarFotoUrl(id, fotoUrl) {
      const actualizada = await repositorio.guardarFotoUrl(id, fotoUrl, ahora());
      if (!actualizada) {
        throw new HttpError(404, "NOT_FOUND", "Minuta no encontrada");
      }
      return actualizada;
    },
  };
}

export const minutasService: MinutasService = crearMinutasService({
  repositorio: minutasRepository,
});
