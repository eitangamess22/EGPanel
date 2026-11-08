import fs from "node:fs/promises";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function seed() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password.length < 12) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) are required");
    }
    const templatesDirectory = path.resolve(process.cwd(), "../../../templates");
    const files = await fs.readdir(templatesDirectory);
    for (const file of files.filter((name) => name.endsWith(".json"))) {
        const raw = await fs.readFile(path.join(templatesDirectory, file), "utf8");
        const template = JSON.parse(raw);
        await prisma.template.upsert({
            where: { slug: template.metadata.slug },
            create: {
                name: template.metadata.name,
                slug: template.metadata.slug,
                type: template.metadata.type,
                version: template.metadata.version,
                description: template.metadata.description ?? null,
                specJson: template.spec,
                variablesJson: template.variables,
                patchesJson: template.patches,
            },
            update: {
                name: template.metadata.name,
                type: template.metadata.type,
                version: template.metadata.version,
                description: template.metadata.description ?? null,
                specJson: template.spec,
                variablesJson: template.variables,
                patchesJson: template.patches,
            },
        });
    }
    await prisma.panelSetting.upsert({
        where: { key: "branding" },
        create: { key: "branding", value: { panelName: "EGPanel", accentColor: "#3B82F6", logoText: "EG" } },
        update: { value: { panelName: "EGPanel", accentColor: "#3B82F6", logoText: "EG" } },
    });
    await prisma.user.upsert({
        where: { email: email.toLowerCase() },
        create: {
            email: email.toLowerCase(),
            username: email.split("@")[0].slice(0, 64),
            passwordHash: await argon2.hash(password),
            roles: ["ADMIN"],
            status: "ACTIVE",
        },
        update: {
            passwordHash: await argon2.hash(password),
            roles: ["ADMIN"],
            status: "ACTIVE",
        },
    });
    console.log("EGPanel seed completed");
}
seed()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(async () => {
    await prisma.$disconnect();
});
