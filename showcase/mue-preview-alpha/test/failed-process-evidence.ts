import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  decodeExecutionPublicationExport, executionPublicationExportFormat,
  executionPublicationIdentityForPublicProcessInstance,
} from "@bpmn-lean/platform-contracts";
import type { ExecutionPublicationExport, PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import { SemanticProcessCompilerId } from "@bpmn-lean/semantic-core";
import {
  TemporalScenarioRunner, observeTemporalExecutionPublication,
  processWorkflowId, readTestProcessTerminalResult, withDeadline,
} from "@bpmn-lean/temporal-testkit";
import type { TemporalWorkflowClient, TemporalExecutionPublicationClient } from "@bpmn-lean/temporal-testkit";
import { failureCode, failureMessage } from "./failed-process-support.ts";
import { collectProcessRunHistories } from "./temporal-evidence.ts";

export async function collectCompensationPublication(
  client: TemporalWorkflowClient,
  instance: PublicProcessInstanceIdentity,
  failed: boolean,
): Promise<ExecutionPublicationExport> {
  const workflowId = processWorkflowId(instance.processInstanceId);
  const terminal = await withDeadline(readTestProcessTerminalResult(client.getHandle(workflowId)), 20_000, "Compensation test terminal receipt");
  assert.equal(terminal.receipt.finalState.status, failed ? "failed" : "completed");
  const identity = executionPublicationIdentityForPublicProcessInstance(instance);
  const producerIdentity = {
    ...identity,
    definition: { ...identity.definition, compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess },
  };
  const batches: unknown[] = [];
  let afterRevision = 0;
  while (true) {
    const observation = await observeTemporalExecutionPublication(client as unknown as TemporalExecutionPublicationClient, workflowId, producerIdentity, { afterRevision, limit: 100 });
    assert.equal(observation.kind, "available");
    if (observation.kind !== "available") throw new Error("Terminal producer publication is unavailable");
    const page = observation.page;
    batches.push(...page.batches);
    if (page.pageThroughRevision === page.headRevision) {
      const publication = decodeExecutionPublicationExport({
        ...identity, format: executionPublicationExportFormat,
        headRevision: page.headRevision, batches, current: page.current,
      }, identity);
      const publicState: unknown = publication.current.state;
      assert.deepEqual(publicState, terminal.receipt.finalState);
      assert.deepEqual(publication.current.controlTokens, []);
      assert.deepEqual(publication.current.scopes, []);
      if (failed) {
        assert.equal(publication.current.state.status, "failed");
        if (publication.current.state.status !== "failed") throw new Error("Expected failed Process");
        const occurrence = (elementId: string) => ({ processInstanceId: instance.processInstanceId, elementId, activation: 1 });
        assert.deepEqual(publication.current.state.failure, {
          kind: "compensationHandlerFailure",
          triggerId: occurrence("operation:Throw_Compensate"),
          handlerId: occurrence("EventSubProcess_UndoGroundTravel"),
          effectId: occurrence("Task_UndoGroundTravel"),
          code: failureCode,
          message: failureMessage,
        });
      }
      return publication;
    }
    assert.ok(page.pageThroughRevision > afterRevision);
    afterRevision = page.pageThroughRevision;
  }
}

/** Host-only evidence starts after public terminal outcomes; no product fact is derived from history. */
export async function replayCompensationRuns(
  client: TemporalWorkflowClient,
  instances: readonly PublicProcessInstanceIdentity[],
): Promise<number> {
  const runner = await TemporalScenarioRunner.create({
    downloadDirectory: fileURLToPath(new URL("../../../.cache/temporal-cli/", import.meta.url)),
  });
  let replayed = 0;
  try {
    for (const instance of instances) {
      const histories = await collectProcessRunHistories(client, instance.processInstanceId);
      for (const history of histories) {
        await withDeadline(runner.replayHistory(history, `platform-compensation-${++replayed}`), 20_000, "Compensation Run replay");
      }
    }
    return replayed;
  } finally {
    await runner.shutdown();
  }
}
