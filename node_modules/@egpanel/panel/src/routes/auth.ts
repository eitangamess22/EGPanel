import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import argon2 from "argon2";
import { authenticator } from "otplib";
import { createSession, revokeSession, bearerFromAuthorization } from "../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totp: z.string().regex(/^\d{6}$/).optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = loginSchema.safeParse(request.body);
    if (!input.success) {
      return reply.code(400).send({ code: "INVALID_INPUT", issues: input.error.flatten() });
    }
    const user = await app.prisma.user.findUnique({ where: { email: input.data.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, input.data.password))) {
      return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" });
    }
    if (user.status !== "ACTIVE" || user.suspendedAt) {
      return reply.code(403).send({ code: "ACCOUNT_DISABLED", message: "This account is unavailable" });
    }
    if (user.totpEnabled) {
      if (!input.data.totp || !user.totpSecret || !authenticator.check(input.data.totp, user.totpSecret)) {
        return reply.code(401).send({ code: "TOTP_REQUIRED", message: "A valid 6-digit authenticator code is required" });
      }
    }
    const token = createSession({
      userId: user.id,
      scopes: user.roles.includes("ADMIN") ? ["*"] : ["server.read", "server.power", "server.file.read"],
    });
    return reply.send({ token, user: { id: user.id, email: user.email, username: user.username, roles: user.roles } });
  });

  app.post("/api/v1/auth/logout", async (request) => {
    const token = bearerFromAuthorization(request.headers.authorization);
    if (token) revokeSession(token);
    return { ok: true };
  });

  app.post("/api/v1/auth/totp/setup", async (request, reply) => {
    if (!request.principal) return reply.code(401).send({ code: "UNAUTHENTICATED" });
    const secret = authenticator.generateSecret();
    await app.prisma.user.update({
      where: { id: request.principal.userId },
      data: { totpSecret: secret },
    });
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.principal.userId } });
    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, "EGPanel", secret),
    };
  });
};
