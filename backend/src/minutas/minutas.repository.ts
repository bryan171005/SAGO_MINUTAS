import type { DocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "../config/firebase";
import {
  normalizarMinuta,
  serializarCambioEstatus,
  serializarFotoUrl,
  serializarMinuta,
} from "./minuta.adapter";
import { ConflictoTransicionError, type Minuta, type MinutasRepository } from "./minuta.types";

export const COLECCION_MINUTAS = "minutas";

function desdeSnapshot(documento: DocumentSnapshot): Minuta {
  return normalizarMinuta(documento.id, documento.data() ?? {});
}

/** Implementacion real. getDb() se llama dentro de cada metodo, nunca al importar. */
export function crearMinutasRepository(): MinutasRepository {
  return {
    async crear(datos, usuario, ahora) {
      const referencia = getDb().collection(COLECCION_MINUTAS).doc();
      const documento = serializarMinuta(datos, usuario, ahora);
      await referencia.set(documento);
      return normalizarMinuta(referencia.id, documento);
    },

    async obtenerPorId(id) {
      const documento = await getDb().collection(COLECCION_MINUTAS).doc(id).get();
      return documento.exists ? desdeSnapshot(documento) : null;
    },

    async listar() {
      // Con el tamano actual del dataset basta una lectura; los filtros se aplican
      // en memoria para soportar tanto campos legacy como nuevos.
      const respuesta = await getDb().collection(COLECCION_MINUTAS).get();
      return respuesta.docs.map(desdeSnapshot);
    },

    async actualizarEstatus(id, estatus, ahora) {
      const db = getDb();
      const referencia = db.collection(COLECCION_MINUTAS).doc(id);

      return db.runTransaction(async (transaccion) => {
        const documento = await transaccion.get(referencia);
        if (!documento.exists) {
          return null;
        }

        const datos = documento.data() ?? {};
        const actual = normalizarMinuta(documento.id, datos);
        if (actual.estatus !== "Pendiente") {
          // Rechequeo dentro de la transaccion: evita que dos gerentes aprueben
          // la misma minuta en paralelo.
          throw new ConflictoTransicionError(
            `La minuta ya esta ${actual.estatus}; solo se puede cambiar desde Pendiente`,
          );
        }

        const cambios = serializarCambioEstatus(estatus, ahora);
        transaccion.update(referencia, cambios);
        return normalizarMinuta(documento.id, { ...(documento.data() ?? {}), ...cambios });
      });
    },

    async guardarFotoUrl(id, fotoUrl, ahora) {
      const db = getDb();
      const referencia = db.collection(COLECCION_MINUTAS).doc(id);

      return db.runTransaction(async (transaccion) => {
        const documento = await transaccion.get(referencia);
        if (!documento.exists) {
          return null;
        }

        const cambios = serializarFotoUrl(fotoUrl, ahora);
        transaccion.update(referencia, cambios);
        return normalizarMinuta(documento.id, { ...(documento.data() ?? {}), ...cambios });
      });
    },
  };
}

export const minutasRepository: MinutasRepository = crearMinutasRepository();
