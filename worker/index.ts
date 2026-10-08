// The site's Cloudflare Worker (static assets plus one route). It serves the built game from
// dist/ as before, and answers /api/feedback: POST stores a tester's note in the FEEDBACK KV
// namespace; GET lists every note for the developer, with the FEEDBACK_ADMIN_KEY password as a
// Bearer token. Configured in wrangler.jsonc; the rules live in src/feedback/server.ts, shared
// with the dev server's stand-in and the tests. Setup: docs/DEPLOY.md.

import { listNotes, receiveNote, type KeyValue } from "../src/feedback/server";

interface Env {
  /** The built site (wrangler.jsonc, "assets"). */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** KV namespace (wrangler.jsonc, "kv_namespaces"). */
  FEEDBACK?: KeyValue;
  /** Secret, set in the Worker's Settings, Variables and Secrets. */
  FEEDBACK_ADMIN_KEY?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

async function feedback(request: Request, env: Env): Promise<Response> {
  if (!env.FEEDBACK) return json(503, { error: "feedback storage (the FEEDBACK binding) is not set up yet" });
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length") ?? 0) > 16_000) return json(413, { error: "note too large" });
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "not JSON" });
    }
    const r = await receiveNote(env.FEEDBACK, body, request.headers.get("cf-connecting-ip") ?? "unknown");
    return json(r.status, r.body);
  }
  if (request.method === "GET") {
    const auth = request.headers.get("authorization");
    const r = await listNotes(env.FEEDBACK, auth?.startsWith("Bearer ") ? auth.slice(7) : null, env.FEEDBACK_ADMIN_KEY);
    return json(r.status, r.body);
  }
  return json(405, { error: "use GET or POST" });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/feedback") return feedback(request, env);
    return env.ASSETS.fetch(request);
  },
};
