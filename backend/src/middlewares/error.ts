import type { NextFunction, Request, Response } from "express";
import multer from "multer";

export type CodigoError =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED"
  | "PAYLOAD_TOO_LARGE";

export class HttpError extends Error {
  readonly status: number;
  readonly code: CodigoError;

  constructor(status: number, code: CodigoError, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

const responderError = (res: Response, status: number, code: string, message: string): void => {
  res.status(status).json({ error: { code, message } });
};

export const notFound = (req: Request, res: Response): void => {
  responderError(res, 404, "NOT_FOUND", `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
};

const esJsonMalFormado = (err: unknown): boolean =>
  err instanceof SyntaxError &&
  "body" in err &&
  (err as { type?: string }).type === "entity.parse.failed";

const esPayloadDemasiadoGrande = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  (err as { type?: string }).type === "entity.too.large";

export const errorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof HttpError) {
    responderError(res, err.status, err.code, err.message);
    return;
  }

  // Multer lanza sus propios errores (tamano, numero de archivos, campos).
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      responderError(res, 413, "PAYLOAD_TOO_LARGE", "La foto excede el tamano permitido");
      return;
    }
    responderError(res, 400, "VALIDATION_ERROR", `Error al subir la foto: ${err.code}`);
    return;
  }

  if (esJsonMalFormado(err)) {
    responderError(res, 400, "VALIDATION_ERROR", "El cuerpo de la peticion no es JSON valido");
    return;
  }

  if (esPayloadDemasiadoGrande(err)) {
    responderError(res, 413, "PAYLOAD_TOO_LARGE", "El cuerpo de la peticion excede el tamano permitido");
    return;
  }

  console.error("[error] Error no controlado:", err);
  responderError(res, 500, "INTERNAL_ERROR", "Error interno del servidor");
};
