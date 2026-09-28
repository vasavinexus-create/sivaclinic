import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const cache = join(root, "work");
mkdirSync(cache, { recursive: true });
const staging = mkdtempSync(join(cache, "sivaclinic-mobile-"));

// Build a client-only copy so web/Electron API routes and running dev servers stay intact.
for (const name of ["app", "lib", "public", "package.json", "tsconfig.json", "next-env.d.ts", "postcss.config.mjs", ".env", ".env.local", ".env.production", ".env.production.local"]) {
  const source = join(root, name);
  if (existsSync(source)) cpSync(source, join(staging, name), {
    recursive: true,
    filter: (path) => resolve(path) !== resolve(root, "app", "api"),
  });
}
symlinkSync(join(root, "node_modules"), join(staging, "node_modules"), process.platform === "win32" ? "junction" : "dir");
writeFileSync(join(staging, "next.config.mjs"), 'export default { output: "export", outputFileTracingRoot: process.cwd(), images: { unoptimized: true } };\n');
const result = spawnSync(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "build", "--webpack"], {
  cwd: staging, stdio: "inherit", env: process.env,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const exported = join(staging, "out");
if (!existsSync(join(exported, "index.html")) || !existsSync(join(exported, "v2.html"))) {
  throw new Error("Mobile export is incomplete. Android sync was stopped.");
}
const output = resolve(root, "out");
if (output !== join(root, "out")) throw new Error("Unexpected mobile output path");
rmSync(output, { recursive: true, force: true });
cpSync(exported, output, { recursive: true });
const stamp = { builtAt: new Date().toISOString(), packageVersion: JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version };
writeFileSync(join(output, "mobile-build.json"), JSON.stringify(stamp));
console.log(`Fresh Android web assets exported at ${stamp.builtAt}`);
