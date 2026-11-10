/**
 * Vercel serverless entry. vercel.json rewrites /api/* here; Hono routes on the original path.
 * Exports Web-standard method handlers, which Vercel's Node.js runtime supports for any framework.
 */
import { createApp } from "../server/app.js";

const app = createApp();
const handler = (req: Request) => app.fetch(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
