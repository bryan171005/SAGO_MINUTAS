export const ESTATUS_MINUTA = ["Pendiente", "Autorizado", "Rechazado"] as const;
export type EstatusMinuta = (typeof ESTATUS_MINUTA)[number];

export interface ActividadesMinuta {
  talachear: boolean;
  semaforear: boolean;
  recolectarDesecho: boolean;
  recolectarRenovado: boolean;
}

export interface UbicacionMinuta {
  latitud: number | null;
  longitud: number | null;
  texto: string | null;
}

/** Minuta normalizada que devuelve la API: campos nuevos y el nombre legible heredado. */
export interface Minuta {
  id: string;
  cliente: string | null;
  vendedor: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  vendedorId: string | null;
  vendedorNombre: string | null;
  fecha: string;
  fechaISO: string | null;
  hora: string;
  detalles: string;
  actividades: ActividadesMinuta;
  estatus: EstatusMinuta;
  fotoUrl: string | null;
  ubicacion: UbicacionMinuta | null;
  createdAt: string;
  updatedAt: string;
}

export interface DatosNuevaMinuta {
  cliente: string;
  vendedor: string;
  clienteId?: string | null;
  vendedorId?: string | null;
  fecha: string;
  hora: string;
  detalles: string;
  actividades: ActividadesMinuta;
  latitud?: number;
  longitud?: number;
  ubicacionTexto?: string;
}

export type OrdenMinutas = "fecha" | "hora" | "estatus";
export type DireccionOrden = "asc" | "desc";

export interface FiltrosMinutas {
  page: number;
  limit: number;
  estatus?: EstatusMinuta;
  cliente?: string;
  vendedor?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  orderBy: OrdenMinutas;
  order: DireccionOrden;
}

export interface MetaPaginacion {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ResultadoListaMinutas {
  items: Minuta[];
  meta: MetaPaginacion;
}

export interface UsuarioCreador {
  uid: string;
  nombre?: string;
}

export interface ArchivoFoto {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface SubidorFotos {
  subir(minutaId: string, archivo: ArchivoFoto): Promise<string>;
}

/** Se lanza dentro de la transaccion de Firestore y el servicio la traduce a HTTP 409. */
export class ConflictoTransicionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictoTransicionError";
  }
}

/** Repositorio inyectable: la logica de negocio nunca habla con Firestore directo. */
export interface MinutasRepository {
  crear(datos: DatosNuevaMinuta, usuario: UsuarioCreador, ahora: string): Promise<Minuta>;
  obtenerPorId(id: string): Promise<Minuta | null>;
  listar(): Promise<Minuta[]>;
  actualizarEstatus(id: string, estatus: EstatusMinuta, ahora: string): Promise<Minuta | null>;
  guardarFotoUrl(id: string, fotoUrl: string, ahora: string): Promise<Minuta | null>;
}
