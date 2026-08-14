import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionPublicationIntegrityError,
  applyExecutionPublicationPage,
  createEmptyExecutionPublicationProjection,
} from "@bpmn-lean/platform-operate";
import type { ExecutionPublicationPage } from "@bpmn-lean/platform-contracts";

import {
  firstPage,
  identity,
  secondPage,
} from "./execution-publication-fixture.ts";

test("rejects a skipped suffix without changing the prior projection", () => {
  const projection = createEmptyExecutionPublicationProjection(identity);
  const before = structuredClone(projection);
  const source = firstPage();
  const batch = source.batches[0]!;
  const skipped = {
    ...source,
    requestedAfterRevision: 1,
    pageThroughRevision: 3,
    headRevision: 3,
    batches: [{
      ...batch,
      fromRevision: 1,
      throughRevision: 3,
      transitions: batch.transitions.map((record) => ({
        ...record,
        revision: record.revision + 1,
      })),
    }],
    current: { ...source.current!, revision: 3 },
  };

  assert.throws(
    () => applyExecutionPublicationPage(
      projection,
      skipped as unknown as ExecutionPublicationPage,
    ),
    ExecutionPublicationIntegrityError,
  );
  assert.deepEqual(projection, before);
});

test("rejects a positive-cursor delta that does not fold from the retained head", () => {
  const prior = applyExecutionPublicationPage(
    createEmptyExecutionPublicationProjection(identity),
    firstPage(),
  );
  const source = secondPage();
  const batch = source.batches[0]!;
  const record = batch.transitions[0]!;
  const forged = {
    ...source,
    batches: [{
      ...batch,
      transitions: [{
        ...record,
        positionDelta: {
          ...record.positionDelta,
          consumedTokens: [{
            sequenceFlowId: "Flow_1",
            owner: source.current!.controlTokens[0]!.owner,
            multiplicity: 1,
          }],
        },
      }],
    }],
  };

  assert.throws(
    () => applyExecutionPublicationPage(
      prior,
      forged as unknown as ExecutionPublicationPage,
    ),
    /current head disagrees with the folded suffix/u,
  );
  assert.equal(prior.headRevision, 2);
  assert.equal(prior.controlTokens[0]?.multiplicity, 1);
});

test("treats an exact overlap as a no-op and a changed overlap as integrity failure", () => {
  const first = firstPage();
  const prior = applyExecutionPublicationPage(
    createEmptyExecutionPublicationProjection(identity),
    first,
  );
  assert.deepEqual(applyExecutionPublicationPage(prior, first), prior);

  const changed = {
    ...first,
    batches: [{ ...first.batches[0]!, commandId: "changed-command" }],
  };
  assert.throws(
    () => applyExecutionPublicationPage(
      prior,
      changed as unknown as ExecutionPublicationPage,
    ),
    /overlapping publication batch changed/u,
  );
});
