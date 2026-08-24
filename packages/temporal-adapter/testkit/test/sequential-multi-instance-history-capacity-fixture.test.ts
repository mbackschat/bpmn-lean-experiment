import assert from "node:assert/strict";
import test from "node:test";

import { CommandOutcome } from "@bpmn-lean/semantic-core";

import {
  createSequentialMultiInstanceCapacityProbeFixture,
} from "./sequential-multi-instance-history-capacity-fixture.ts";

test("builds distinct natural and interrupted closures with a count-only 16/17 separator", async () => {
  const fixture = await createSequentialMultiInstanceCapacityProbeFixture();

  assert.equal(fixture.natural.updates.length, 16);
  assert.equal(fixture.interrupted.updates.length, 17);
  assert.equal(
    fixture.natural.updates.at(-1)?.taskId.elementId,
    "UserTask_Review",
  );
  assert.equal(
    fixture.interrupted.updates.at(-2)?.taskId.elementId,
    "UserTask_Review",
  );
  assert.equal(
    fixture.interrupted.updates.at(-1)?.taskId.elementId,
    "UserTask_Escalation",
  );
  const stale = fixture.interrupted.updates.at(-2);
  assert.ok(stale !== undefined);
  assert.equal(
    fixture.interrupted.staticPayload.terminal.entries.find(({ commandId }) =>
      commandId === stale.commandId
    )?.outcome,
    CommandOutcome.Rejected,
  );
  assert.equal(fixture.separator.canonicalMaximumCollectionBytes, 8_192);
  assert.equal(fixture.separator.exact16Admitted, true);
  assert.equal(fixture.separator.exact17Refused, true);
  for (const topology of [fixture.natural, fixture.interrupted]) {
    assert.equal(
      topology.staticPayload.finalPublication.execution.headRevision,
      topology.staticPayload.finalPublication.occurrences.headRevision,
    );
  }
  assert.notDeepEqual(
    fixture.natural.staticPayload.finalPublication,
    fixture.interrupted.staticPayload.finalPublication,
  );
});
