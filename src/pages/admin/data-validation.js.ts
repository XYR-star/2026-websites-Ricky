import type { APIRoute } from "astro";
import source from "../../lib/page-data.mjs?raw";

export const prerender = true;

export const GET: APIRoute = () => new Response(source, {
  headers: {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  },
});
