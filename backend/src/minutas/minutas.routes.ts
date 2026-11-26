import { Router } from "express";
import type { RequestHandler } from "express";
import { requireRole, requiereAuth } from "../middlewares/auth";
import type { RolUsuario } from "../usuarios/usuario.types";
import { minutasController, type MinutasController } from "./minutas.controller";
import { uploadFoto } from "./minuta.storage";

export interface DependenciasRutasMinutas {
  requiereAuth: RequestHandler;
  requireRol: (...roles: RolUsuario[]) => RequestHandler;
  controller: MinutasController;
  subirFoto: RequestHandler;
}

/** Router fabricable: los tests inyectan sus propios middlewares sin Firebase. */
export function crearMinutasRouter({
  requiereAuth: autenticar,
  requireRol: exigirRol,
  controller,
  subirFoto: subir,
}: DependenciasRutasMinutas): Router {
  const router = Router();

  router.use(autenticar);

  router.get("/", controller.listar);
  router.get("/:id", controller.obtener);
  router.post("/", exigirRol("operador", "gerente"), controller.crear);
  router.patch("/:id/estatus", exigirRol("gerente"), controller.cambiarEstatus);
  router.post("/:id/foto", exigirRol("operador", "gerente"), subir, controller.subirFoto);

  return router;
}

export const minutasRouter = crearMinutasRouter({
  requiereAuth,
  requireRol: requireRole,
  controller: minutasController,
  subirFoto: uploadFoto.single("foto"),
});
