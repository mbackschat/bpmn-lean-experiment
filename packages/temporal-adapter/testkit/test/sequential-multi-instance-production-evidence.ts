import assert from "node:assert/strict";

import type {
  CanonicalObservation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  FlowNodeOccurrencePublicationResultKind,
  bpmnTraceQueryName,
  observeTemporalFlowNodeOccurrences,
  type BpmnProcessWorkflow,
  type FlowNodeOccurrenceBatch,
  type TemporalFlowNodeOccurrencePublicationClient,
  type TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import {
  SequentialMultiInstanceHistoryRunRole,
  SequentialMultiInstanceHistoryTopology,
} from "@bpmn-lean/temporal-workflow";
import type { TestWorkflowEnvironment } from "@temporalio/testing";
import type { WorkflowBundleWithSourceMap } from "@temporalio/worker";

import {
  requireSequentialMultiInstanceProductionHistory,
  type SequentialMultiInstanceProductionHistoryRunEvidence,
} from "./sequential-multi-instance-history-evidence.ts";
import { replayBpmnHistory } from "./temporal-worker-test-support.ts";
import {
  workflowChainRuns,
} from "./workflow-chain-test-support.ts";

export type SequentialMultiInstanceProductionClosure = Readonly<{
  trace: ReadonlyArray<CanonicalObservation>;
  occurrenceBatches: ReadonlyArray<FlowNodeOccurrenceBatch>;
}>;

/** Collects, classifies, and replays every production Run in one SMI chain. */
export async function closeSequentialMultiInstanceProductionEvidence(
  environment: TestWorkflowEnvironment,
  bundle: WorkflowBundleWithSourceMap,
  workflowId: string,
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
  topology: SequentialMultiInstanceHistoryTopology,
): Promise<SequentialMultiInstanceProductionClosure> {
  const runs = await workflowChainRuns(environment, workflowId);
  const histories: SequentialMultiInstanceProductionHistoryRunEvidence[] = [];
  const trace: CanonicalObservation[] = [];
  for (const [index, run] of runs.entries()) {
    const handle = environment.client.workflow.getHandle<BpmnProcessWorkflow>(
      workflowId,
      run.runId,
    );
    const history = await handle.fetchHistory();
    assert.ok(history !== null && history !== undefined);
    const description = await handle.describe();
    const historySize = description.historySize;
    assert.equal(typeof historySize, "number");
    if (typeof historySize !== "number") {
      throw new TypeError("SMI service History has no byte size");
    }
    histories.push({
      runOrdinal: index + 1,
      role: roleFor(topology, index),
      history: history as TemporalHistory,
      historySize,
    });
    trace.push(...await handle.query<ReadonlyArray<CanonicalObservation>>(
      bpmnTraceQueryName,
    ));
    await replayBpmnHistory(bundle, history, workflowId);
  }
  requireSequentialMultiInstanceProductionHistory({
    topology,
    runs: histories,
  });
  return {
    trace,
    occurrenceBatches: await readOccurrenceBatches(
      environment,
      workflowId,
      semanticProcess,
      processInstanceId,
    ),
  };
}

/** Reads per-Run Event counts without treating Event History as semantic state. */
export async function sequentialMultiInstanceRunHistoryLengths(
  environment: TestWorkflowEnvironment,
  workflowId: string,
): Promise<ReadonlyArray<number>> {
  const runs = await workflowChainRuns(environment, workflowId);
  return Promise.all(runs.map(async ({ runId }) => {
    const history = await environment.client.workflow
      .getHandle(workflowId, runId).fetchHistory();
    assert.ok(history !== null && history !== undefined);
    assert.ok(Array.isArray(history.events));
    return history.events.length;
  }));
}

async function readOccurrenceBatches(
  environment: TestWorkflowEnvironment,
  workflowId: string,
  semanticProcess: SemanticProcessProgram,
  processInstanceId: string,
): Promise<ReadonlyArray<FlowNodeOccurrenceBatch>> {
  const batches: FlowNodeOccurrenceBatch[] = [];
  let afterRevision = 0;
  for (let page = 0; page < 32; page += 1) {
    const result = await observeTemporalFlowNodeOccurrences(
      environment.client.workflow as unknown as
        TemporalFlowNodeOccurrencePublicationClient,
      workflowId,
      {
        definition: semanticProcess.identity,
        processId: semanticProcess.processId,
        processInstanceId,
      },
      { afterRevision, limit: 100 },
    );
    assert.equal(
      result.kind,
      FlowNodeOccurrencePublicationResultKind.Available,
    );
    if (result.kind !== FlowNodeOccurrencePublicationResultKind.Available) {
      assert.fail("SMI occurrence publication is unavailable");
    }
    batches.push(...result.page.batches);
    if (result.page.pageThroughRevision === result.page.headRevision) {
      return batches;
    }
    assert.ok(result.page.pageThroughRevision > afterRevision);
    afterRevision = result.page.pageThroughRevision;
  }
  throw new Error("SMI occurrence publication did not reach its head");
}

function roleFor(
  topology: SequentialMultiInstanceHistoryTopology,
  index: number,
): SequentialMultiInstanceHistoryRunRole {
  if (index === 0) {
    return SequentialMultiInstanceHistoryRunRole.PreArming;
  }
  if (index === 1) {
    return SequentialMultiInstanceHistoryRunRole.Armed;
  }
  if (
    index === 2 &&
    topology === SequentialMultiInstanceHistoryTopology.Interrupted
  ) {
    return SequentialMultiInstanceHistoryRunRole.StaleRefusal;
  }
  if (
    index === 3 &&
    topology === SequentialMultiInstanceHistoryTopology.Interrupted
  ) {
    return SequentialMultiInstanceHistoryRunRole.Escalation;
  }
  throw new TypeError(`unexpected SMI production Run ${String(index + 1)}`);
}
