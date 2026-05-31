/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// Dev-only middleware: POST to /__lab-snapshot writes the body JSON to a
// fixed path so the agent can Read it directly. Disabled in production.
function labSnapshotPlugin(): Plugin {
  const OUT_PATH = "/tmp/roombuilder-lab-snapshot.json";
  return {
    name: "lab-snapshot-writer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__lab-snapshot", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("POST only");
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks).toString("utf8");
            mkdirSync(dirname(OUT_PATH), { recursive: true });
            writeFileSync(OUT_PATH, body, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, path: OUT_PATH, bytes: body.length }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), labSnapshotPlugin()],
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
