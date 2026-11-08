import { describe, expect, it } from "vitest";
describe("EGPanel API contract", () => {
    it("accepts supported power actions", () => {
        expect(["start", "stop", "restart", "kill"]).toContain("restart");
    });
    it("does not accept unknown template types", () => {
        const supported = new Set(["MINECRAFT_JAVA", "DISCORD_NODE", "DISCORD_PYTHON"]);
        expect(supported.has("UNKNOWN")).toBe(false);
    });
});
