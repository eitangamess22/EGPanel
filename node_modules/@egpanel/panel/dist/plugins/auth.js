import fp from "fastify-plugin";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
const sessions = new Map();
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
export function createSession(principal) {
    const token = randomBytes(32).toString("base64url");
    sessions.set(hashToken(token), principal);
    return token;
}
export function revokeSession(token) {
    sessions.delete(hashToken(token));
}
export function secureTokenEquals(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
}
export function bearerFromAuthorization(header) {
    if (!header?.startsWith("Bearer "))
        return undefined;
    return header.slice(7).trim() || undefined;
}
export default fp(async (app) => {
    app.decorateRequest("principal", undefined);
    app.addHook("preHandler", async (request, reply) => {
        if (request.url.startsWith("/health") ||
            request.url.startsWith("/api/v1/auth/login") ||
            request.url.startsWith("/api/v1/auth/password/reset")) {
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
    app.decorate("requireScopes", (scopes) => async (request, reply) => {
        const allowed = new Set(request.principal?.scopes ?? []);
        if (scopes.some((scope) => !allowed.has(scope) && !allowed.has("*"))) {
            return reply.code(403).send({ code: "FORBIDDEN", message: "You do not have permission for this action" });
        }
    });
});
