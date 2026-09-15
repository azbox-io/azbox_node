import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Through the package name, as users load it: this resolves "exports" and
// "main", which is what 0.1.x got wrong (main pointed to a file not shipped).
import { AzboxClient, AzboxError } from "azbox-node";

const KEY = "azb_live_" + "x".repeat(32);

function fakeFetch(respond) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: new URL(url), headers: init?.headers ?? {} });
    const { status = 200, body = [] } = respond(calls.at(-1)) ?? {};
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { impl, calls };
}

const client = (fetch, extra = {}) =>
  new AzboxClient({ apiKey: KEY, projectId: "p1", language: "es", fetch, ...extra });

test("require() loads the package too", () => {
  const require = createRequire(import.meta.url);
  const cjs = require("azbox-node");
  assert.equal(typeof cjs.AzboxClient, "function");
});

test("calls /v1/projects/:id/keywords on api.azbox.io", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await client(impl).getKeywords();
  assert.equal(calls[0].url.origin + calls[0].url.pathname, "https://api.azbox.io/v1/projects/p1/keywords");
});

test("the 0.1.x baseUrl with /v1 does not duplicate the version", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await client(impl, { baseUrl: "https://api.azbox.io/v1/" }).getKeywords();
  assert.equal(calls[0].url.pathname, "/v1/projects/p1/keywords");
});

test("a base URL with a path keeps it", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await client(impl, { baseUrl: "http://localhost:5001/demo/us-central1/api" }).getKeywords();
  assert.equal(calls[0].url.pathname, "/demo/us-central1/api/v1/projects/p1/keywords");
});

test("azb_live_ keys go in the x-api-key header, never in the URL", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await client(impl).getKeywords();
  assert.equal(calls[0].headers["x-api-key"], KEY);
  assert.equal(calls[0].url.searchParams.has("api_key"), false);
  assert.equal(calls[0].url.searchParams.has("token"), false);
  assert.equal(calls[0].url.href.includes(KEY), false);
});

test("older credentials go as ?api_key=, and `token` still works", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await new AzboxClient({ token: "abcd-1234-efgh-5678", projectId: "p1", language: "ES", fetch: impl }).getKeywords();
  assert.equal(calls[0].url.searchParams.get("api_key"), "abcd-1234-efgh-5678");
  assert.equal(calls[0].headers["x-api-key"], undefined);
});

test("language is sent in upper case", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await client(impl, { language: "pt-br" }).getKeywords();
  assert.equal(calls[0].url.searchParams.get("language"), "PT-BR");
});

test("afterUpdatedAt is sent as afterUpdatedAtStr in ISO", async () => {
  const { impl, calls } = fakeFetch(() => ({ body: [] }));
  await client(impl).getKeywords({ afterUpdatedAt: new Date("2026-09-01T00:00:00.000Z") });
  assert.equal(calls[0].url.searchParams.get("afterUpdatedAtStr"), "2026-09-01T00:00:00.000Z");
});

test("404 'No keywords found' is an empty list", async () => {
  const { impl } = fakeFetch(() => ({ status: 404, body: { detail: "No keywords found" } }));
  assert.deepEqual(await client(impl).getKeywords(), []);
});

test("404 'Language not found' throws", async () => {
  const { impl } = fakeFetch(() => ({ status: 404, body: { detail: "Language not found" } }));
  await assert.rejects(client(impl).getKeywords(), (e) => e instanceof AzboxError && e.status === 404);
});

for (const status of [401, 403, 500]) {
  test(`${status} throws AzboxError with the status`, async () => {
    const { impl } = fakeFetch(() => ({ status, body: { error: "nope" } }));
    await assert.rejects(client(impl).getKeywords(), (e) => e instanceof AzboxError && e.status === status);
  });
}

test("a network failure throws AzboxError", async () => {
  const impl = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(client(impl).getKeywords(), /could not reach/);
});

test("getTranslations maps data.keyword to translation and skips untranslated", async () => {
  const { impl } = fakeFetch(() => ({
    body: [
      { id: "a1", data: { keyword: "home.title", translation: "Bienvenido" } },
      { id: "a2", data: { keyword: "home.empty" } },
      { id: "a3", data: { translation: "sin clave" } },
    ],
  }));
  assert.deepEqual(await client(impl).getTranslations(), { "home.title": "Bienvenido" });
});

test("missing options throw a clear error", () => {
  assert.throws(() => new AzboxClient({ projectId: "p1", language: "ES" }), /'apiKey' is required/);
  assert.throws(() => new AzboxClient({ apiKey: KEY, language: "ES" }), /'projectId' is required/);
  assert.throws(() => new AzboxClient({ apiKey: KEY, projectId: "p1" }), /'language' is required/);
});
