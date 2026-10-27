import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function renderNetlifyRedirects(apiUrl) {
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error("RENDER_API_URL must be an HTTPS Render service origin.");
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname.endsWith(".onrender.com") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error("RENDER_API_URL must be an HTTPS Render service origin without credentials, path, query, or fragment.");
  }

  const origin = parsed.origin;
  return `/api/* ${origin}/api/:splat 200\n`;
}

async function build() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const redirects = renderNetlifyRedirects(process.env.RENDER_API_URL ?? "");
  const outputPath = join(root, "public", "_redirects");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, redirects, "utf8");
  process.stdout.write("Generated public API proxy configuration.\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  build().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
