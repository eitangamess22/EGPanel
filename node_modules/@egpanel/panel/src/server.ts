import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { env } from "./env.js";
import prismaPlugin from "./plugins/prisma.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { resourceRoutes } from "./routes/resources.js";

export async function buildServer() {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    trustProxy: true,
    requestIdHeader: "x-request-id",
  });

  await app.register(cors, {
    origin: env.NODE_ENV === "production" ? false : true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    redis: env.REDIS_URL,
  });
  await app.register(websocket);
  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => ({
    status: "ok",
    service: "EGPanel",
    timestamp: new Date().toISOString(),
  }));

  await app.register(authRoutes);
  await app.register(resourceRoutes);

  app.register(async (socketApp) => {
    socketApp.get("/api/v1/ws", { websocket: true }, (socket, request) => {
      socket.on("message", (raw) => {
        try {
          const frame = JSON.parse(raw.toString()) as { v?: number; type?: string; payload?: Record<string, unknown> };
          if (frame.v !== 1 || !frame.type) {
            socket.send(JSON.stringify({ type: "error", payload: { code: "INVALID_FRAME" } }));
            return;
          }
          if (frame.type === "ping") {
            socket.send(JSON.stringify({ v: 1, type: "pong", payload: { time: Date.now() } }));
          }
        } catch {
          socket.send(JSON.stringify({ v: 1, type: "error", payload: { code: "INVALID_JSON" } }));
        }
      });
      socket.send(JSON.stringify({ v: 1, type: "connected", payload: { service: "EGPanel" } }));
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const err = error as Error & { statusCode?: number; code?: string };
    const status = typeof err.statusCode === "number" ? err.statusCode : 500;
    reply.code(status).send({
      code: err.code ?? (status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
      message: status === 500 ? "The request could not be completed" : err.message,
      requestId: request.id,
    });
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await buildServer();
  await app.listen({ host: env.HOST, port: env.PORT });
}
