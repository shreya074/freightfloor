import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const files = new Set([
  "/web/index.html",
  "/web/app.js",
  "/web/style.css",
  "/web/draw.js",
  "/web/worker.js",
  "/web/fonts/BarlowCondensed-SemiBold.ttf",
  "/web/fonts/DMSans.ttf",
  "/src/world.js",
  "/src/planner.js",
  "/src/heap.js",
  "/src/sipp.js",
  "/examples/crossdock.json",
  "/examples/passing-bay.json",
  "/examples/four-way.json",
]);
const mime = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  ttf: "font/ttf",
};
const root = new URL("../", import.meta.url);
const server = createServer(async (request, reply) => {
  let path;
  try {
    path = new URL(request.url, "http://localhost").pathname;
  } catch {
    reply.writeHead(400).end();
    return;
  }
  if (path === "/") path = "/web/index.html";
  if (request.method !== "GET" || !files.has(path)) {
    reply.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(new URL(path.slice(1), root));
    reply
      .writeHead(200, {
        "Content-Type": mime[path.split(".").at(-1)],
        "X-Content-Type-Options": "nosniff",
      })
      .end(bytes);
  } catch {
    reply.writeHead(500).end();
  }
});
server.listen(Number(process.env.PORT ?? 4173), "127.0.0.1", () =>
  console.log(
    "Freightfloor listening at http://127.0.0.1:" + server.address().port,
  ),
);
