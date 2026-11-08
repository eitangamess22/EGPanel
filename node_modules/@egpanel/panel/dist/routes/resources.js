import { z } from "zod";
import argon2 from "argon2";
const serverCreateSchema = z.object({
    name: z.string().min(1).max(100),
    ownerId: z.string().min(1),
    nodeId: z.string().min(1),
    templateId: z.string().min(1),
    memoryBytes: z.number().int().positive(),
    diskBytes: z.number().int().positive(),
    cpuPercent: z.number().positive().max(100),
    allocationIds: z.array(z.string()).min(1),
    variables: z.record(z.string()).default({}),
});
export const resourceRoutes = async (app) => {
    app.get("/api/v1/users", async () => {
        return app.prisma.user.findMany({
            select: { id: true, email: true, username: true, status: true, roles: true, createdAt: true },
        });
    });
    app.post("/api/v1/users", { preHandler: app.requireScopes(["user.write"]) }, async (request, reply) => {
        const schema = z.object({
            email: z.string().email(),
            username: z.string().min(2).max(64),
            password: z.string().min(12),
            roles: z.array(z.string()).default([]),
        });
        const input = schema.safeParse(request.body);
        if (!input.success)
            return reply.code(400).send({ code: "INVALID_INPUT", issues: input.error.flatten() });
        const user = await app.prisma.user.create({
            data: {
                email: input.data.email.toLowerCase(),
                username: input.data.username,
                passwordHash: await argon2.hash(input.data.password),
                roles: input.data.roles,
            },
            select: { id: true, email: true, username: true, status: true, roles: true },
        });
        return reply.code(201).send(user);
    });
    app.get("/api/v1/servers", async (request) => {
        const ownerId = request.query;
        return app.prisma.server.findMany({
            where: ownerId.ownerId ? { ownerId: ownerId.ownerId } : undefined,
            include: {
                owner: { select: { id: true, username: true } },
                node: { select: { id: true, name: true, fqdn: true } },
                template: { select: { id: true, name: true, type: true, version: true } },
                allocations: true,
            },
            orderBy: { updatedAt: "desc" },
        });
    });
    app.post("/api/v1/servers", { preHandler: app.requireScopes(["server.create"]) }, async (request, reply) => {
        const input = serverCreateSchema.safeParse(request.body);
        if (!input.success)
            return reply.code(400).send({ code: "INVALID_INPUT", issues: input.error.flatten() });
        const template = await app.prisma.template.findUnique({ where: { id: input.data.templateId } });
        if (!template)
            return reply.code(404).send({ code: "TEMPLATE_NOT_FOUND", message: "Template does not exist" });
        const server = await app.prisma.$transaction(async (tx) => {
            const allocations = await tx.allocation.findMany({
                where: { id: { in: input.data.allocationIds }, serverId: null },
            });
            if (allocations.length !== input.data.allocationIds.length) {
                throw Object.assign(new Error("One or more allocations are unavailable"), { statusCode: 409, code: "ALLOCATION_CONFLICT" });
            }
            const created = await tx.server.create({
                data: {
                    name: input.data.name,
                    type: template.type,
                    ownerId: input.data.ownerId,
                    nodeId: input.data.nodeId,
                    templateId: template.id,
                    templateVersion: template.version,
                    memoryBytes: input.data.memoryBytes,
                    diskBytes: input.data.diskBytes,
                    cpuPercent: input.data.cpuPercent,
                    state: "INSTALLING",
                    variables: {
                        create: Object.entries(input.data.variables).map(([name, value]) => ({ name, value })),
                    },
                },
            });
            await tx.allocation.updateMany({
                where: { id: { in: input.data.allocationIds } },
                data: { serverId: created.id },
            });
            return created;
        });
        return reply.code(201).send(server);
    });
    app.get("/api/v1/servers/:serverId", async (request, reply) => {
        const { serverId } = request.params;
        const server = await app.prisma.server.findUnique({
            where: { id: serverId },
            include: { allocations: true, variables: true, subusers: true },
        });
        if (!server)
            return reply.code(404).send({ code: "SERVER_NOT_FOUND", message: "Server does not exist" });
        return server;
    });
    app.post("/api/v1/servers/:serverId/power/:action", { preHandler: app.requireScopes(["server.power"]) }, async (request, reply) => {
        const { serverId, action } = request.params;
        if (!["start", "stop", "restart", "kill"].includes(action)) {
            return reply.code(400).send({ code: "INVALID_POWER_ACTION", message: "Use start, stop, restart, or kill" });
        }
        const server = await app.prisma.server.findUnique({ where: { id: serverId } });
        if (!server)
            return reply.code(404).send({ code: "SERVER_NOT_FOUND", message: "Server does not exist" });
        await app.prisma.auditLog.create({
            data: {
                actorId: request.principal?.userId,
                serverId,
                action: `server.power.${action}`,
                outcome: "SUCCESS",
                metadata: { command: action },
                requestId: request.id,
            },
        });
        return { accepted: true, action, serverId };
    });
    app.get("/api/v1/nodes", async () => app.prisma.node.findMany({ include: { _count: { select: { servers: true } } } }));
    app.post("/api/v1/nodes", { preHandler: app.requireScopes(["node.write"]) }, async (request, reply) => {
        const schema = z.object({
            name: z.string().min(2).max(100),
            fqdn: z.string().min(3).max(255),
            memoryBytes: z.coerce.number().positive(),
            diskBytes: z.coerce.number().positive(),
            cpuCores: z.coerce.number().positive(),
            token: z.string().min(32),
        });
        const input = schema.safeParse(request.body);
        if (!input.success)
            return reply.code(400).send({ code: "INVALID_INPUT", issues: input.error.flatten() });
        const { createHash } = await import("node:crypto");
        const node = await app.prisma.node.create({
            data: {
                name: input.data.name,
                fqdn: input.data.fqdn,
                memoryBytes: input.data.memoryBytes,
                diskBytes: input.data.diskBytes,
                cpuCores: input.data.cpuCores,
                tokenHash: createHash("sha256").update(input.data.token).digest("hex"),
            },
        });
        return reply.code(201).send(node);
    });
    app.get("/api/v1/templates", async () => app.prisma.template.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }));
    app.post("/api/v1/templates", { preHandler: app.requireScopes(["template.write"]) }, async (request, reply) => {
        const schema = z.object({
            name: z.string().min(2).max(100),
            slug: z.string().regex(/^[a-z0-9-]+$/),
            type: z.enum(["MINECRAFT_JAVA", "DISCORD_NODE", "DISCORD_PYTHON"]),
            version: z.string().min(1),
            specJson: z.record(z.unknown()),
            variablesJson: z.array(z.record(z.unknown())).default([]),
            patchesJson: z.array(z.record(z.unknown())).default([]),
            description: z.string().optional(),
        });
        const input = schema.safeParse(request.body);
        if (!input.success)
            return reply.code(400).send({ code: "INVALID_INPUT", issues: input.error.flatten() });
        const template = await app.prisma.template.create({
            data: {
                name: input.data.name,
                slug: input.data.slug,
                type: input.data.type,
                version: input.data.version,
                description: input.data.description,
                specJson: input.data.specJson,
                variablesJson: input.data.variablesJson,
                patchesJson: input.data.patchesJson,
            },
        });
        return reply.code(201).send(template);
    });
    app.get("/api/v1/templates/:templateId/export", async (request, reply) => {
        const { templateId } = request.params;
        const template = await app.prisma.template.findUnique({ where: { id: templateId } });
        if (!template)
            return reply.code(404).send({ code: "TEMPLATE_NOT_FOUND", message: "Template does not exist" });
        return {
            apiVersion: "egpanel.io/v1",
            kind: "Template",
            metadata: { name: template.name, slug: template.slug, type: template.type, version: template.version },
            spec: template.specJson,
            variables: template.variablesJson,
            patches: template.patchesJson,
        };
    });
    app.get("/api/v1/audit-log", async (request) => {
        const query = request.query;
        const limit = Math.min(Number(query.limit ?? 100), 500);
        return app.prisma.auditLog.findMany({ take: limit, orderBy: { createdAt: "desc" } });
    });
    app.get("/api/v1/settings", async () => app.prisma.panelSetting.findMany().then((rows) => Object.fromEntries(rows.map((row) => [row.key, row.value]))));
    app.patch("/api/v1/settings", async (request, reply) => {
        const input = z.record(z.unknown()).safeParse(request.body);
        if (!input.success)
            return reply.code(400).send({ code: "INVALID_INPUT" });
        await app.prisma.$transaction(Object.entries(input.data).map(([key, value]) => app.prisma.panelSetting.upsert({
            where: { key },
            create: { key, value: value },
            update: { value: value },
        })));
        return input.data;
    });
};
