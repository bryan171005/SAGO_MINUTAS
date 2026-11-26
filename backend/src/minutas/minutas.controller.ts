import type { Request, Response } from "express";
import { HttpError } from "../middlewares/error";
import {
  validarCambioEstatus,
  validarConsultaMinutas,
  validarCrearMinuta,
} from "./minutas.schemas";
import { minutasService, type MinutasService } from "./minutas.service";
import { subidorFotos } from "./minuta.storage";
import type { SubidorFotos } from "./minuta.types";

export interface DependenciasMinutasController {
  service: MinutasService;
  subirFoto: SubidorFotos;
}

/** Express 5 tipa los parametros como string | string[]. */
function idDe(valor: string | string[]): string {
  return Array.isArray(valor) ? (valor[0] ?? "") : valor;
}

export function crearMinutasController({ service, subirFoto }: DependenciasMinutasController) {
  return {
    async crear(req: Request, res: Response): Promise<void> {
      const datos = validarCrearMinuta(req.body);
      const autenticado = req.usuario;
      if (!autenticado) {
        throw new HttpError(401, "UNAUTHORIZED", "Token de autorizacion ausente");
      }

      const minuta = await service.crear(datos, {
        uid: autenticado.uid,
        nombre: autenticado.nombre ?? autenticado.email,
      });
      res.status(201).json({ minuta });
    },

    async listar(req: Request, res: Response): Promise<void> {
      const filtros = validarConsultaMinutas(req.query);
      res.status(200).json(await service.listar(filtros));
    },

    async obtener(req: Request, res: Response): Promise<void> {
      const minuta = await service.obtener(idDe(req.params.id));
      res.status(200).json({ minuta });
    },

    async cambiarEstatus(req: Request, res: Response): Promise<void> {
      const estatus = validarCambioEstatus(req.body);
      const minuta = await service.cambiarEstatus(idDe(req.params.id), estatus);
      res.status(200).json({ minuta });
    },

    async subirFoto(req: Request, res: Response): Promise<void> {
      if (!req.file) {
        throw new HttpError(400, "VALIDATION_ERROR", "El archivo foto es obligatorio");
      }

      const url = await subirFoto.subir(idDe(req.params.id), {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
      const minuta = await service.guardarFotoUrl(idDe(req.params.id), url);
      res.status(200).json({ minuta });
    },
  };
}

export type MinutasController = ReturnType<typeof crearMinutasController>;

export const minutasController = crearMinutasController({
  service: minutasService,
  subirFoto: subidorFotos,
});
