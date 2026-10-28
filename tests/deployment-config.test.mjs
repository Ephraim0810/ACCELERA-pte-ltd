import test from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderNetlifyRedirects } from "../scripts/build-netlify.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const redirectsPath = join(root, "public", "_redirects");

test("maps static app routes and proxies API routes to the Render origin", () => {
  assert.equal(
    renderNetlifyRedirects("https://casepilot-api.onrender.com/"),
    [
      "/ /login.html 200!",
      "/login /login.html 200",
      "/payment /payment.html 200",
      "/transactions /transactions.html 200",
      "/admin /admin.html 200",
      "/overview /index.html 200",
      "/guide /guide.html 200",
      "/request /request.html 200",
      "/api/* https://casepilot-api.onrender.com/api/:splat 200",
      "",
    ].join("\n"),
  );
});

test("rejects malformed, non-HTTPS, and non-Render API origins", () => {
  for (const value of ["not a url", "http://casepilot-api.onrender.com", "https://example.com", "https://casepilot-api.onrender.com/path", "https://user:pass@casepilot-api.onrender.com"]) {
    assert.throws(() => renderNetlifyRedirects(value), /RENDER_API_URL/i);
  }
});

test("build writes static routes and the public API proxy without embedding secrets", async (t) => {
  t.after(async () => { await rm(redirectsPath, { force: true }); });
  const result = spawnSync(process.execPath, [join(root, "scripts", "build-netlify.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      RENDER_API_URL: "https://casepilot-api.onrender.com",
      GROQ_API_KEY: "test-groq-secret",
      TURSO_AUTH_TOKEN: "test-turso-secret",
      DATABASE_URL: "libsql://private-db.turso.io",
      DEMO_ADMIN_PASSWORD: "test-admin-secret",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = await readFile(redirectsPath, "utf8");
  assert.match(output, /^\/ \/login\.html 200!\n/);
  assert.match(output, /^\/transactions \/transactions\.html 200$/m);
  assert.match(output, /^\/admin \/admin\.html 200$/m);
  assert.match(output, /^\/payment \/payment\.html 200$/m);
  assert.match(output, /^\/api\/\* https:\/\/casepilot-api\.onrender\.com\/api\/:splat 200$/m);
  assert.doesNotMatch(output, /test-groq-secret|test-turso-secret|private-db|test-admin-secret|GROQ_API_KEY|TURSO_AUTH_TOKEN|DATABASE_URL|DEMO_ADMIN_PASSWORD/);
});

test("deployment manifests use generated Netlify redirects and Render health checks", async () => {
  const [netlify, render] = await Promise.all([
    readFile(join(root, "netlify.toml"), "utf8"),
    readFile(join(root, "render.yaml"), "utf8"),
  ]);
  assert.match(netlify, /node scripts\/build-netlify\.mjs/);
  assert.match(netlify, /publish\s*=\s*"public"/);
  assert.match(render, /startCommand:\s*npm start/);
  assert.match(render, /healthCheckPath:\s*\/api\/health/);
});
