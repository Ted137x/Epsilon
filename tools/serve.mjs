// ES modules do not load from file://, so the editor needs a local server.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const port = Number(process.env.PORT) || 8080;

createServer(async (req, res) => {
  const path = normalize(join(root, decodeURIComponent(req.url.split("?")[0])));
  if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path.endsWith(sep) || path === root ? join(path, "index.html") : path);
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "text/html" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Epsilon: http://localhost:${port}`));
