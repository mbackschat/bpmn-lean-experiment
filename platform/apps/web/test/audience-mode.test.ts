import assert from "node:assert/strict";
import { test } from "node:test";

import { audienceModeFromSearch } from "../src/audience-mode.ts";

test("enables the audience guide only for its exact query value", () => {
  assert.equal(audienceModeFromSearch("?audience=demo"), true);
  assert.equal(audienceModeFromSearch("?other=value&audience=demo"), true);
  assert.equal(audienceModeFromSearch(""), false);
  assert.equal(audienceModeFromSearch("?audience=developer"), false);
  assert.equal(audienceModeFromSearch("?audience=demo-preview"), false);
});
