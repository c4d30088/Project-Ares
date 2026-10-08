// Cloudflare Pages function at /api/feedback (deployed with the site; see docs/DEPLOY.md).
// POST: a tester's note, stored in the FEEDBACK KV namespace. GET: every note, for the
// developer, with the FEEDBACK_ADMIN_KEY password as a Bearer token. The rules are in
// src/feedback/server.ts, shared with the local dev stand-in and the tests.

import { listNotes, receiveNote, type KeyValue } from "../../src/feedback/server";

interface Env {
  /** KV namespace binding (Pages project, Settings, Bindings). */
  FEEDBACK?: KeyValue;
  /** Secret (Pages project, Settings, Variables and secrets). */
  FEEDBACK_ADMIN_KEY?: string;
}

interface Context {
  request: Request;
  env: Env;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });

const notSetUp = () => json(503, { error: "feedback storage (the FEEDBACK binding) is not set up yet" });

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.FEEDBACK) return notSetUp();
  if (Number(request.headers.get("content-length") ?? 0) > 16_000) return json(413, { error: "note too large" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "not JSON" });
  }
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const r = await receiveNote(env.FEEDBACK, body, address);
  return json(r.status, r.body);
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  if (!env.FEEDBACK) return notSetUp();
  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const r = await listNotes(env.FEEDBACK, key, env.FEEDBACK_ADMIN_KEY);
  return json(r.status, r.body);
}
