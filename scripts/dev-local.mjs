// Local full-stack development without `vercel dev`.
//
// Serves the Vite app and runs the Vercel Functions in api/ in the same
// process on http://localhost:3000. Rewrites come from vercel.json and
// server variables from .env.local. Use it where `vercel dev` cannot run,
// for example on Windows without Developer Mode (its builders need
// symlinks).

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { createServer, loadEnv } from "vite";

const root = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT) || 3000;

Object.assign(process.env, loadEnv("development", root, ""));

const { rewrites = [] } = JSON.parse(
  await readFile(path.join(root, "vercel.json"), "utf8"),
);

function applyRewrites(url) {
  const rule = rewrites.find(({ source }) => source === url.pathname);

  if (!rule) {
    return url;
  }

  const target = new URL(rule.destination, url);

  url.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  return target;
}

function handlerFile(pathname) {
  const file = path.join(root, `${pathname.replace(/\/$/, "")}.js`);

  return file.startsWith(path.join(root, "api")) && existsSync(file)
    ? file
    : null;
}

function toRequest(req, url) {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of [value].flat()) {
      if (item !== undefined) {
        headers.append(name, item);
      }
    }
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);

  return new Request(url, {
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
    headers,
    method: req.method,
  });
}

async function sendResponse(res, response) {
  res.statusCode = response.status;

  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") {
      res.setHeader(name, value);
    }
  });

  const cookies = response.headers.getSetCookie();

  if (cookies.length > 0) {
    res.setHeader("set-cookie", cookies);
  }

  res.setHeader("cache-control", "no-store");
  res.end(Buffer.from(await response.arrayBuffer()));
}

function vercelFunctions() {
  return {
    name: "local-vercel-functions",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) {
          return next();
        }

        const url = applyRewrites(
          new URL(req.url, `http://${req.headers.host}`),
        );
        const file = handlerFile(url.pathname);

        if (!file) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Not found" }));
          return undefined;
        }

        try {
          const { default: handler } = await server.ssrLoadModule(file);

          await sendResponse(
            res,
            await handler.fetch(toRequest(req, url)),
          );
        } catch (error) {
          server.config.logger.error(
            `${req.method} ${url.pathname} failed: ${error.stack || error}`,
          );
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Local function error" }));
        }

        return undefined;
      });
    },
  };
}

const server = await createServer({
  plugins: [vercelFunctions()],
  root,
  server: { port, strictPort: true },
});

await server.listen();
server.printUrls();
