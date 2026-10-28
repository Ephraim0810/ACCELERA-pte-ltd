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

  const routes = [
    // Force this rewrite because public/index.html exists but is the legacy page.
    "/ /login.html 200!",
    "/login /login.html 200",
    "/payment /payment.html 200",
    "/transactions /transactions.html 200",
    "/admin /admin.html 200",
    "/overview /index.html 200",
    "/guide /guide.html 200",
    "/request /request.html 200",
    `/api/* ${parsed.origin}/api/:splat 200`,
  ];
  return `${routes.join("\n")}\n`;
}

async function build() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const redirects = renderNetlifyRedirects(process.env.RENDER_API_URL ?? "");
  const outputPath = join(root, "public", "_redirects");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, redirects, "utf8");
  process.stdout.write("Generated Netlify page routes and API proxy configuration.\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  build().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
