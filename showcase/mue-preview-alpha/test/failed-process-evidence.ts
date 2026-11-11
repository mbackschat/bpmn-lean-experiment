import assert from "node:assert/strict";
import {
  decodeExecutionPublicationExport, executionPublicationExportFormat,
  publicationIdentityForPublicProcessInstance,
} from "@bpmn-lean/platform-contracts";
import type { ExecutionPublicationExport, PublicProcessInstanceIdentity } from "@bpmn-lean/platform-contracts";
import { PageKind, ResultKind } from "@bpmn-lean/temporal-host/client";
import type { Batch, ExecutionTransition, ProcessClient } from "@bpmn-lean/temporal-host/client";

import { withDeadline } from "../src/host-worker.ts";
import type { TemporalEnvironment } from "../src/host-worker.ts";
import { failureCode, failureMessage } from "./failed-process-support.ts";
import { alphaTaskQueue, processWorkflowId } from "../src/process-address.ts";
import { collectProcessRunHistories, replayEveryRun } from "./temporal-evidence.ts";

/**
 * The producer's own publication, read from the host's queries rather than through Product 2: every execution batch the
 * chain retains and, at the head, its committed state. The platform's export must be exactly this value, since the
 * engine gateway passes the host's batches through unchanged
 * (`platform/foundation/engine-gateway/src/process-publication-gateway.ts`).
 */
export async function collectCompensationPublication(
  client: TemporalEnvironment["client"],
  processes: ProcessClient,
  instance: PublicProcessInstanceIdentity,
  failed: boolean,
): Promise<ExecutionPublicationExport> {
  const workflowId = processWorkflowId(alphaTaskQueue, instance.processInstanceId);
  const terminal = await withDeadline(client.workflow.getHandle(workflowId).result(), 20_000, "Compensation test terminal result");
  assert.equal(terminal.kind, ResultKind.Ended);
  assert.equal(terminal.status, failed ? "failed" : "completed");
  const identity = publicationIdentityForPublicProcessInstance(instance);
  const batches: Batch<ExecutionTransition>[] = [];
  let afterRevision = 0;
  while (true) {
    const page = await processes.publication(workflowId, afterRevision, 100);
    assert.equal(page.kind, PageKind.Available);
    if (page.kind !== PageKind.Available) throw new Error("Terminal producer publication has a gap");
    batches.push(...page.execution);
    const through = page.execution.at(-1)?.throughRevision ?? afterRevision;
    if (through === page.headRevision) {
      const state = await processes.observation(workflowId);
      const publication = decodeExecutionPublicationExport({
        ...identity, format: executionPublicationExportFormat,
        headRevision: page.headRevision, batches, current: { revision: page.headRevision, state },
      }, identity);
      assert.equal(terminal.revision, page.headRevision);
      assert.equal(publication.current.state.status, failed ? "failed" : "completed");
      assert.deepEqual(publication.current.state.scopes, []);
      assert.deepEqual(publication.current.state.openWaits, []);
      if (failed) {
        const occurrence = (elementId: string) => ({ processInstanceId: instance.processInstanceId, elementId, activation: 1 });
        assert.deepEqual(publication.current.state.failure, {
          code: failureCode,
          message: failureMessage,
          occurrence: occurrence("Task_UndoGroundTravel"),
          related: [
            { name: "trigger", occurrence: occurrence("Throw_Compensate") },
            { name: "handler", occurrence: occurrence("EventSubProcess_UndoGroundTravel") },
          ],
        });
      }
      return publication;
    }
    assert.ok(through > afterRevision);
    afterRevision = through;
  }
}

/** Host-only evidence starts after public terminal outcomes; no product fact is derived from history. */
export async function replayCompensationRuns(
  client: TemporalEnvironment["client"],
  instances: readonly PublicProcessInstanceIdentity[],
): Promise<number> {
  let replayed = 0;
  for (const [index, instance] of instances.entries()) {
    replayed += await replayEveryRun(`platform-compensation-${index + 1}`,
      await collectProcessRunHistories(client, instance.processInstanceId));
  }
  return replayed;
}
