import fp from "fastify-plugin";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type Principal = {
  userId: string;
  scopes: string[];
};

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

const sessions = new Map<string, Principal>();
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function createSession(principal: Principal) {
  const token = randomBytes(32).toString("base64url");
  sessions.set(hashToken(token), principal);
  return token;
}

export function revokeSession(token: string) {
  sessions.delete(hashToken(token));
}

export function secureTokenEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerFromAuthorization(header?: string) {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7).trim() || undefined;
}

export default fp(async (app) => {
  app.decorateRequest("principal", undefined);
  app.addHook("preHandler", async (request, reply) => {
    if (
      request.url.startsWith("/health") ||
      request.url.startsWith("/api/v1/auth/login") ||
      request.url.startsWith("/api/v1/auth/password/reset")
    ) {
      return;
    }
    const token = bearerFromAuthorization(request.headers.authorization);
    if (!token) {
      reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sign in to continue" });
      return reply;
    }
    const principal = sessions.get(hashToken(token));
    if (!principal) {
      reply.code(401).send({ code: "INVALID_SESSION", message: "Your session has expired" });
      return reply;
    }
    request.principal = principal;
  });

  app.decorate("requireScopes", (scopes: string[]) => async (request: any, reply: any) => {
    const allowed = new Set(request.principal?.scopes ?? []);
    if (scopes.some((scope) => !allowed.has(scope) && !allowed.has("*"))) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "You do not have permission for this action" });
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    requireScopes(scopes: string[]): (request: any, reply: any) => Promise<any>;
  }
}
