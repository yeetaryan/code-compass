/** Local API server. Vite proxies /api to this port (see vite.config.ts). */
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { env } from "./env.js";

env(); // fail fast on bad config
const port = Number(process.env.API_PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) => console.log(`API listening on http://localhost:${info.port}/api`));
