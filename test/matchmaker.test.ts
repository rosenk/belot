import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedOrigin, isReadyMessage } from "../matchmaker/protocol.ts";

test("matchmaker accepts only short Belot room codes", () => {
  assert.equal(isReadyMessage({ type: "ready", room: "7KPM2Q" }), true);
  assert.equal(isReadyMessage({ type: "ready", room: "O0I1AA" }), false);
  assert.equal(isReadyMessage({ type: "ready", room: "7KPM2Q", extra: true }), true);
  assert.equal(isReadyMessage({ type: "other", room: "7KPM2Q" }), false);
});

test("matchmaker accepts exact local, Pages, and wildcard Amp portal origins", () => {
  const allowed = "http://localhost:*,https://*.onamp.dev,https://rosenk.github.io";
  assert.equal(isAllowedOrigin("http://localhost:5173", allowed), true);
  assert.equal(isAllowedOrigin("http://localhost:32141", allowed), true);
  assert.equal(isAllowedOrigin("https://belot-example.onamp.dev", allowed), true);
  assert.equal(isAllowedOrigin("https://rosenk.github.io", allowed), true);
  assert.equal(isAllowedOrigin("https://rosenk.github.io.evil.example", allowed), false);
  assert.equal(isAllowedOrigin("https://onamp.dev.evil.example", allowed), false);
  assert.equal(isAllowedOrigin(null, allowed), false);
});
