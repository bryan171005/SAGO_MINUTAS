import { z } from "zod";
import { HttpError } from "../middlewares/error";
import { aISOFecha } from "./minuta.adapter";
import { ESTATUS_MINUTA, type DatosNuevaMinuta } from "./minuta.types";

const esquemaFecha = z
  .string({ error: "fecha debe ser un texto" })
  .trim()
  .refine((valor) => aISOFecha(valor) !== null, "fecha debe ser valida (yyyy-mm-dd o dd/mm/yyyy)");

const esquemaHora = z
  .string({ error: "hora debe ser un texto" })
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "hora debe tener formato HH:mm o HH:mm:ss");

const esquemaActividades = z.object({
  talachear: z.boolean().default(false),
  semaforear: z.boolean().default(false),
  recolectarDesecho: z.boolean().default(false),
  recolectarRenovado: z.boolean().default(false),
});

const esquemaIdentificador = z
  .string({ error: "debe ser un texto" })
  .trim()
  .min(1)
  .max(200)
  .nullable()
  .optional();

export const esquemaCrearMinuta = z.object({
  cliente: z
    .string({ error: "cliente debe ser un texto" })
    .trim()
    .min(1, "cliente es obligatorio")
    .max(200, "cliente es demasiado largo"),
  vendedor: z
    .string({ error: "vendedor debe ser un texto" })
    .trim()
    .min(1, "vendedor es obligatorio")
    .max(200, "vendedor es demasiado largo"),
  clienteId: esquemaIdentificador,
  vendedorId: esquemaIdentificador,
  fecha: esquemaFecha,
  hora: esquemaHora,
  detalles: z
    .string({ error: "detalles debe ser un texto" })
    .trim()
    .max(2000, "detalles es demasiado largo")
    .default(""),
  actividades: esquemaActividades.default({
    talachear: false,
    semaforear: false,
    recolectarDesecho: false,
    recolectarRenovado: false,
  }),
  latitud: z.number().min(-90).max(90).optional(),
  longitud: z.number().min(-180).max(180).optional(),
  ubicacionTexto: z.string().trim().max(300).optional(),
});

export const esquemaConsultaMinutas = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  estatus: z.enum(ESTATUS_MINUTA).optional(),
  cliente: z.string().trim().min(1).optional(),
  vendedor: z.string().trim().min(1).optional(),
  fechaDesde: esquemaFecha.optional(),
  fechaHasta: esquemaFecha.optional(),
  orderBy: z.enum(["fecha", "hora", "estatus"]).default("fecha"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const esquemaCambioEstatus = z.object({
  estatus: z.enum(["Autorizado", "Rechazado"], {
    error: "estatus debe ser Autorizado o Rechazado",
  }),
});

function errorDeValidacion(issues: z.ZodError["issues"]): HttpError {
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    issues[0]?.message ?? "Datos de entrada invalidos",
  );
}

export function validarCrearMinuta(body: unknown): DatosNuevaMinuta {
  const resultado = esquemaCrearMinuta.safeParse(body ?? {});
  if (!resultado.success) {
    throw errorDeValidacion(resultado.error.issues);
  }
  return resultado.data;
}

export function validarConsultaMinutas(query: unknown) {
  const resultado = esquemaConsultaMinutas.safeParse(query ?? {});
  if (!resultado.success) {
    throw errorDeValidacion(resultado.error.issues);
  }
  return resultado.data;
}

export function validarCambioEstatus(body: unknown): "Autorizado" | "Rechazado" {
  const resultado = esquemaCambioEstatus.safeParse(body ?? {});
  if (!resultado.success) {
    throw errorDeValidacion(resultado.error.issues);
  }
  return resultado.data.estatus;
}
