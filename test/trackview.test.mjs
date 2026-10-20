import test from "node:test";
import assert from "node:assert/strict";
import { STEPS, stepIndex, headline, isRouteId, elapsedMin } from "../trackview.js";

test("each Houdini status maps to the right step", () => {
  assert.equal(stepIndex({ status: -1 }), 0);
  assert.equal(stepIndex({ status: 0 }), 1);
  assert.equal(stepIndex({ status: 1 }), 1);
  assert.equal(stepIndex({ status: 2 }), 2);
  assert.equal(stepIndex({ status: 3, outStatus: 0 }), 3);
  assert.equal(stepIndex({ status: 3, outStatus: 3 }), 4);
  assert.equal(stepIndex({ status: 3, outStatus: 4 }), 5);
  assert.equal(stepIndex({ status: 4 }), STEPS.length);
  for (const s of [5, 6, 7, 8]) assert.equal(stepIndex({ status: s }), -1);
});

test("headlines say plainly what happened", () => {
  assert.equal(headline({ status: 4 }).text, "Delivered");
  assert.match(headline({ status: 6, actionRequired: true }).text, /support/);
  assert.match(headline({ status: 7 }).text, /Refunded/);
  assert.equal(headline({ status: 3 }).tone, "live");
});

test("route ids are validated and elapsed time is in minutes", () => {
  assert.ok(isRouteId("hxK7mQp2"));
  assert.ok(!isRouteId("../etc") && !isRouteId("") && !isRouteId("a b"));
  assert.equal(elapsedMin({ created: "2026-10-20T14:00:00Z", orderFinishedReceived: "2026-10-20T14:23:00Z" }), 23);
  assert.equal(elapsedMin({}), null);
});
