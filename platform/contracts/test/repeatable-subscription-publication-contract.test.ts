import assert from "node:assert/strict";
import test from "node:test";
import { decodeExecutionPublicationPage } from "@bpmn-lean/platform-contracts";
import { executionPublicationPage, publicationIdentity } from "./execution-publication-fixture.ts";

for (const operationKind of ["awaitMessageMonitoredUserTask", "enterMonitoredScope"]) {
  test(`decodes the published ${operationKind} operation without private fields`, () => {
    const page = executionPublicationPage();
    const base = page.batches[0]!.transitions[0]!;
    const transition = {
      kind: "internalOperation", operationId: "subscription-arm", operationKind,
      origin: { kind: "bpmnElement", elementId: "SubscriptionHost" },
      owner: page.current!.scopes[0]!.id,
    };
    const token = { sequenceFlowId: "Flow_Subscription", owner: transition.owner, multiplicity: 1 };
    const record = { ...base, revision: 2, transition, positionDelta: {
      consumedTokens: [], producedTokens: [token], enteredScopes: [], exitedScopes: [],
    } };
    const changed = { ...page, pageThroughRevision: 2, headRevision: 2,
      batches: [{ ...page.batches[0]!, throughRevision: 2, transitions: [base, record] }],
      current: { ...page.current!, revision: 2, controlTokens: [token] },
    };
    const context = { ...publicationIdentity, afterRevision: 0, limit: 1 };
    assert.deepEqual(decodeExecutionPublicationPage(changed, context), changed);
    assert.throws(() => decodeExecutionPublicationPage({ ...changed, batches: [{
      ...changed.batches[0]!, transitions: [base, { ...record, transition: { ...transition, privateWait: true } }],
    }] }, context));
  });
}
