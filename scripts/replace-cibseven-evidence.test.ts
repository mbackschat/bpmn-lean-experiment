import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cibEvidenceEffectSchedule,
  requireReplacementAuthorization,
} from "./replace-cibseven-evidence.ts";

test("routes only the two incident profiles to their exact CIB schedules", () => {
  assert.equal(
    cibEvidenceEffectSchedule(
      "cibseven-2.2.0-service-task-incident-draft",
    ),
    "incidentReportRetrySuccess",
  );
  assert.equal(
    cibEvidenceEffectSchedule(
      "cibseven-2.2.0-service-task-incident-cancellation-draft",
    ),
    "incidentReportCancel",
  );
  assert.equal(cibEvidenceEffectSchedule("old-profile"), "plainSuccess");
});

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
