import cors from "cors";
import express from "express";
import type { Express } from "express";
import { authRouter } from "./auth/auth.routes";
import { corsOptions } from "./config/cors";
import { docsRouter, openapiJson } from "./config/swagger";
import { errorHandler, notFound } from "./middlewares/error";
import { minutasRouter } from "./minutas/minutas.routes";
import { healthRouter } from "./routes/health";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "1mb" }));

  app.get("/openapi.json", openapiJson);
  app.use("/docs", docsRouter);
  app.use("/health", healthRouter);
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/minutas", minutasRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
