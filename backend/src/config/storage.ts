import { getStorage as getFirebaseStorage } from "firebase-admin/storage";
import type { Storage } from "firebase-admin/storage";
import { env } from "./env";
import { getFirebaseAdmin } from "./firebase";

type Bucket = ReturnType<Storage["bucket"]>;

let storage: Storage | undefined;

/**
 * Cliente de Firebase Storage, inicializado de forma perezosa.
 */
export function getStorage(): Storage {
  if (!storage) {
    storage = getFirebaseStorage(getFirebaseAdmin());
  }
  return storage;
}

/**
 * Nombre del bucket destino, con una unica fuente de verdad.
 *
 * FIREBASE_STORAGE_BUCKET manda cuando esta definido (necesario para proyectos
 * cuyo bucket es `<project>.firebasestorage.app`); si no, se usa el bucket
 * historico `<project>.appspot.com`.
 */
export function nombreBucket(): string {
  const configurado = env.FIREBASE_STORAGE_BUCKET.trim();
  return configurado.length > 0 ? configurado : `${env.FIREBASE_PROJECT_ID}.appspot.com`;
}

/**
 * Referencia al bucket ya resuelto. Se pasa el nombre de forma explicita porque
 * Firebase Admin no infiere `storageBucket` de `projectId` por si solo.
 */
export function getBucket(): Bucket {
  return getStorage().bucket(nombreBucket());
}
