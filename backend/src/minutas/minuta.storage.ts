import multer from "multer";
import { getBucket, nombreBucket } from "../config/storage";
import { HttpError } from "../middlewares/error";
import type { SubidorFotos } from "./minuta.types";

export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/** Solo raster: SVG se descarta porque se servira publicamente desde Storage. */
const EXTENSIONES_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export function extensionDeMime(mimetype: string): string | null {
  return EXTENSIONES_POR_MIME[mimetype.toLowerCase()] ?? null;
}

/** Mismo formato que usa `urlPublica` en el script de migracion de WP6. */
export function urlPublicaFoto(ruta: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    nombreBucket(),
  )}/o/${encodeURIComponent(ruta)}?alt=media`;
}

/** Multer en memoria: el buffer se envia directo a Storage, nunca al disco. */
export const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FOTO_BYTES, files: 1 },
  fileFilter: (_req, archivo, callback) => {
    if (extensionDeMime(archivo.mimetype)) {
      callback(null, true);
      return;
    }
    callback(
      new HttpError(
        415,
        "UNSUPPORTED_MEDIA_TYPE",
        "La foto debe ser una imagen raster permitida (jpg, png, webp, gif, bmp, heic, heif)",
      ),
    );
  },
});

export function crearSubidorFotos(): SubidorFotos {
  return {
    async subir(minutaId, archivo) {
      // Los ids de Firestore son seguros, pero no aceptamos rutas arbitrarias.
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(minutaId)) {
        throw new HttpError(400, "VALIDATION_ERROR", "id de minuta invalido");
      }

      const extension = extensionDeMime(archivo.mimetype);
      if (!extension) {
        throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "Tipo de imagen no permitido");
      }

      const ruta = `fotos/${minutaId}.${extension}`;
      await getBucket()
        .file(ruta)
        .save(archivo.buffer, {
          contentType: archivo.mimetype,
          metadata: { cacheControl: "public, max-age=31536000" },
          resumable: false,
        });

      return urlPublicaFoto(ruta);
    },
  };
}

/** No inicializa Firebase al importar: getBucket() se llama dentro de subir(). */
export const subidorFotos: SubidorFotos = crearSubidorFotos();
