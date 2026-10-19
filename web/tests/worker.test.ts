import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { allowed } from "../src/worker.ts";

const env = () => ({ASSETS: {fetch: async () => new Response("static")}, BACKEND_URL: "http://127.0.0.1:8000", LOCAL_DEMO: "true", API_LIMITER: {limit: async () => ({success: true})}} as unknown as Parameters<typeof worker.fetch>[1]);
test("gateway route allowlist exposes bounded jobs but excludes arbitrary URLs and chat", () => {
  assert.ok(allowed("POST", "/api/affairs/12/classify"));
  assert.ok(allowed("POST", "/api/research/search"));
  assert.ok(allowed("POST", "/api/research/analyse"));
  assert.ok(allowed("POST", "/api/fact-checks"));
  assert.ok(allowed("POST", "/api/fact-checks/" + "a".repeat(32) + "/sentences/0"));
  assert.ok(allowed("POST", "/api/fact-checks/" + "a".repeat(32) + "/sentences/0/translations/de"));
  assert.equal(allowed("POST", "/api/fact-checks/" + "a".repeat(32) + "/sentences/0/translations/es"), false);
  assert.ok(allowed("POST", "/api/jobs"));
  assert.ok(allowed("GET", "/api/jobs/" + "a".repeat(16)));
  assert.ok(allowed("GET", "/api/jobs/estimate"));
  assert.ok(allowed("POST", "/api/jobs/" + "a".repeat(16) + "/cancel"));
  assert.equal(allowed("GET", "/api/fact-checks"), false);
  for (const path of ["/api/jobs/garbage/cancel", "/chat", "/api/proxy", "/api/affairs/12/delete", "/api/affairs/https://evil"]) assert.equal(allowed("POST", path), false);
});
test("remote requests fail closed even with a spoofed JWT", async () => {
  const response = await worker.fetch(new Request("https://desk.example/api/status", {headers:{"cf-access-jwt-assertion":"fake"}}), env());
  assert.equal(response.status, 503);
});
test("reject cross origin and oversized streamed bodies", async () => {
  assert.equal((await worker.fetch(new Request("http://localhost/api/topics", {method:"POST",headers:{origin:"https://evil.example"}}), env())).status, 403);
  assert.equal((await worker.fetch(new Request("http://localhost/api/topics", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({value:"x".repeat(33000)})}), env())).status, 413);
});
test("forwards approved local calls without user cookies or authorization", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    assert.equal(String(input), "http://127.0.0.1:8000/api/status");
    assert.equal(new Headers(options?.headers).get("cookie"), null);
    assert.equal(new Headers(options?.headers).get("authorization"), null);
    assert.equal(options?.redirect, "manual");
    return Response.json({affairs: 12});
  };
  try {
    const response = await worker.fetch(new Request("http://localhost/api/status", {headers:{cookie:"private=1",authorization:"Bearer attacker"}}), env());
    assert.equal(response.status, 200); assert.equal((await response.json()).affairs, 12);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = original; }
});
test("rate limits and missing local backend fail clearly", async () => {
  const limited = env(); limited.API_LIMITER.limit = async () => ({success:false});
  assert.equal((await worker.fetch(new Request("http://localhost/api/status"), limited)).status, 429);
  const missing = env(); missing.BACKEND_URL = "";
  assert.equal((await worker.fetch(new Request("http://localhost/api/status"), missing)).status, 503);
});
test("serves the calm UI at the root, preserves the legacy workspace and restricts asset paths", async () => {
  const seen: string[] = [];
  const assets = env();
  assets.ASSETS.fetch = async (request: Request) => { seen.push(new URL(request.url).pathname); return new Response("static"); };
  const root = await worker.fetch(new Request("https://desk.example/"), assets);
  const calm = await worker.fetch(new Request("https://desk.example/calm/"), assets);
  const legacy = await worker.fetch(new Request("https://desk.example/legacy"), assets);
  const js = await worker.fetch(new Request("https://desk.example/calm/assets/app.js"), assets);
  assert.equal(root.status, 200); assert.equal(calm.status, 200); assert.equal(legacy.status, 200); assert.equal(js.status, 200);
  assert.deepEqual(seen, ["/calm/index.html", "/calm/index.html", "/index.html", "/calm/assets/app.js"]);
  assert.equal((await worker.fetch(new Request("https://desk.example/calm/../api/status"), assets)).status, 503);
  assert.equal(seen.length, 4, "normalized API paths must not be served as static assets");
});
