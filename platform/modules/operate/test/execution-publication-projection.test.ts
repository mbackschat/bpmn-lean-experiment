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
  headOnlyPage,
  headPageWithoutCurrent,
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

test("keeps the state retained at its revision when a head page carries none", () => {
  const prior = applyExecutionPublicationPage(
    createEmptyExecutionPublicationProjection(identity),
    firstPage(),
  );
  const reread = applyExecutionPublicationPage(prior, headOnlyPage(2, false));
  assert.deepEqual(reread.current, prior.current);

  const advanced = applyExecutionPublicationPage(prior, headPageWithoutCurrent(secondPage()));
  assert.equal(advanced.headRevision, 3);
  assert.equal(advanced.producerHeadRevision, 3);
  assert.equal(advanced.current, null);
});

test("rejects a state that changed at an accepted revision", () => {
  const prior = applyExecutionPublicationPage(
    createEmptyExecutionPublicationProjection(identity),
    firstPage(),
  );
  const page = headOnlyPage(2, true);
  const changed = {
    ...page,
    current: { ...page.current!, state: { ...page.current!.state, logicalTimeMs: 1 } },
  };
  assert.throws(
    () => applyExecutionPublicationPage(prior, changed),
    /current state changed at an accepted revision/u,
  );
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
