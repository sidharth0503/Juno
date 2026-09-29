import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiUrl } from "../src/lib/config.ts";

test("local API default and explicit URL preserve separate-server development", () => {
  assert.equal(resolveApiUrl(undefined, "development"), "http://localhost:8000");
  assert.equal(resolveApiUrl("https://api.example.test/", "production"), "https://api.example.test");
});

test("production default and explicit empty URL are same origin", () => {
  assert.equal(resolveApiUrl(undefined, "production"), "");
  assert.equal(resolveApiUrl("", "production"), "");
  assert.equal(resolveApiUrl("", "development"), "");
});
