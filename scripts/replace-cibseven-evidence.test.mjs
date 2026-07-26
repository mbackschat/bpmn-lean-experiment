import assert from "node:assert/strict";
import { test } from "node:test";

import {
  requireReplacementAuthorization,
} from "./replace-cibseven-evidence.mjs";

test("requires explicit authorization before replacing CIB evidence", () => {
  assert.throws(
    () => requireReplacementAuthorization([]),
    /exact --replace flag/,
  );
  assert.throws(
    () => requireReplacementAuthorization(["--replace", "--extra"]),
    /exact --replace flag/,
  );
  assert.doesNotThrow(
    () => requireReplacementAuthorization(["--replace"]),
  );
});
