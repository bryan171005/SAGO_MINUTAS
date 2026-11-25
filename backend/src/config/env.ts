import "dotenv/config";
import { z } from "zod";

const listaSeparadaPorComas = (valor: string): string[] =>
  valor
    .split(",")
    .map((elemento) => elemento.trim())
    .filter((elemento) => elemento.length > 0);

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FIREBASE_PROJECT_ID: z.string().min(1).default("sago-minutas"),
  FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().default(""),
  FIREBASE_STORAGE_BUCKET: z.string().default(""),
  ADMIN_EMAILS: z.string().default("").transform(listaSeparadaPorComas),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .default("http://localhost:5173,http://localhost:3000")
    .transform(listaSeparadaPorComas),
});

const resultado = esquemaEntorno.safeParse(process.env);

if (!resultado.success) {
  const detalles = resultado.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("\n");
  console.error(`[env] Variables de entorno invalidas:\n${detalles}`);
  process.exit(1);
}

export const env = resultado.data;
export type Env = typeof env;