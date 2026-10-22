/**
 * Temporal recovery isolation and publication size for concurrent embedded activations.
 *
 * The capsule's hosting preflight leaves two obligations to family closure: a completion addressed to one
 * activation must never reach a live sibling activation of the same element after Worker replacement or
 * accepted-result recovery, and the largest retained schedules must fit the 192 KiB query and terminal
 * ceilings of the lifecycle specification. The complete pipeline covers only the primary run, the
 * isolation run and history replay.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  EngineDefinitionCompilationStatus, EngineDefinitionStartStatus, compileBpmnDefinition, startBpmnDefinitionVersion,
} from "@bpmn-lean/engine-api";
import { createLazyTemporalClientRuntime } from "@bpmn-lean/temporal-client/definition-start";
import {
  CommandOutcome, ProcessStatus, ScenarioStepKind, StimulusKind, advanceScenario, observeStableState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, CompleteUserTaskInstanceStimulus, Scenario, StartProcessStimulus, StateObservation,
} from "@bpmn-lean/semantic-core";
import {
  ExecutionPublicationResultKind, FlowNodeOccurrencePublicationResultKind, WorkflowChainBudgetKind,
  bpmnSemanticTaskQueue, bpmnTraceQueryName, createCachedLocalEnvironment, getTestProcessHandle,
  loadBpmnWorkflowBundle, observeTemporalExecutionPublication, observeTemporalFlowNodeOccurrences, processWorkflowId,
  readPublicationUntilAnswered, readTestProcessTerminalResult, submitUserTaskCompletion,
  workflowChainCanonicalUtf8ByteLength, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalExecutionPublicationClient, TemporalFlowNodeOccurrencePublicationClient,
} from "@bpmn-lean/temporal-testkit";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { loadJson, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, workflowChainRuns } from "./workflow-chain-test-support.ts";

const operationDeadlineMs = 20_000;
const scenarioIds = ["audit-interleaved-and-stale", "audit-reversed", "intake-reverse-assessments"] as const;

test("a completion reaches only its own activation through Worker replacement, accepted-result recovery and replay", async (t) => {
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "concurrent-activations-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "concurrent activations Temporal environment startup");
  const definitionRuntime = createLazyTemporalClientRuntime({ address: environment.address,
    namespace: environment.client.options.namespace, connectTimeoutMs: 5000 });
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "concurrent-activations-original");
    for (const scenarioId of scenarioIds) {
      const scenario = await loadJson<Scenario>(new URL(
        `../../../../scenarios/concurrent-embedded-activations/${scenarioId}.scenario.json`, import.meta.url));
      const xml = await readFile(new URL(`../../../../${scenario.bpmn.relativePath}`, import.meta.url), "utf8");
      const request = { bytes: new TextEncoder().encode(xml), sourceId: scenario.bpmn.id,
        expectedSha256: scenario.bpmn.sha256, semanticProfile: scenario.profile, sourceOverlay: null,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } };
      const compiled = await compileBpmnToSemanticProcess(request);
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail(`${scenarioId} must be admitted`);
      const program = compiled.semanticProcess;
      assert.equal((await compileBpmnDefinition(request)).status, EngineDefinitionCompilationStatus.Accepted);

      // Every registered schedule names Instance_1, so each run gets its own Workflow ID.
      const instanceId = `concurrent-activations-${scenarioId}`;
      const [registeredStart, ...completions] = scenario.stimuli;
      assert.equal(registeredStart?.kind, StimulusKind.StartProcess);
      // The public definition start names its command after the instance.
      const start = { ...registeredStart as StartProcessStimulus, instanceId, commandId: `start:${instanceId}` };
      const commands = completions.map((stimulus): CompleteUserTaskInstanceStimulus => {
        assert.equal(stimulus.kind, StimulusKind.CompleteUserTaskInstance);
        const completion = stimulus as CompleteUserTaskInstanceStimulus;
        return { ...completion, taskId: { ...completion.taskId, processInstanceId: instanceId } };
      });
      const workflowId = processWorkflowId(instanceId);
      const oracle = createBusinessTaskHostOracle(environment, program, start);
      const started = await startBpmnDefinitionVersion({ ...request, temporalClient: definitionRuntime.client,
        expectedProcessId: start.processId, processInstanceId: instanceId,
        initialVariables: start.initialVariables, taskQueue: bpmnSemanticTaskQueue });
      assert.equal(started.status, EngineDefinitionStartStatus.Started);
      oracle.advance(start);

      const published = async (): Promise<StateObservation> => {
        const expected = observeStableState(program, oracle.state);
        const state = await waitForPublishedWorkflowChainState(environment, workflowId, program, instanceId,
          (current) => isDeepStrictEqual(current, expected));
        await oracle.assertPublications();
        return state;
      };
      // One read of the current publication, so the isolation assertions below compare it with a recorded state
      // instead of waiting until it matches the oracle.
      const current = (): Promise<StateObservation> =>
        waitForPublishedWorkflowChainState(environment, workflowId, program, instanceId, () => true);

      let isolatedCompletions = 0;
      const committedCommandIds: string[] = [];
      for (const command of commands) {
        const before = await published();
        const siblings = before.openUserTasks.filter(({ id }) =>
          id.elementId === command.taskId.elementId && id.activation !== command.taskId.activation);
        const step = advanceScenario(program, oracle.state, command);
        const outcome = step.kind === ScenarioStepKind.Committed ? CommandOutcome.Committed : CommandOutcome.Rejected;
        if (outcome === CommandOutcome.Committed && siblings.length > 0) {
          await stopBpmnTestWorker(worker!);
          worker = undefined;
          worker = await startBpmnTestWorker(environment, bundle, `concurrent-activations-replacement-${scenarioId}-${command.commandId}`);
          assert.deepEqual(await current(), before);
        }
        assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, command),
          { kind: "semantic", commandId: command.commandId, outcome });
        if (step.kind === ScenarioStepKind.Committed) {
          oracle.advance(command);
          committedCommandIds.push(command.commandId);
        } else {
          assert.equal(step.kind, ScenarioStepKind.Terminal);
          if (step.kind !== ScenarioStepKind.Terminal) assert.fail(`${command.commandId} must be refused`);
          assert.deepEqual(step.state, oracle.state);
          oracle.trace.push(...step.observations);
        }
        if (outcome !== CommandOutcome.Committed || siblings.length === 0) continue;
        const after = await published();
        // Accepted-result recovery: the repeated Update returns the recorded result and leaves every sibling open.
        assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, instanceId, command),
          { kind: "semantic", commandId: command.commandId, outcome: CommandOutcome.Committed });
        const recovered = await current();
        assert.deepEqual(recovered, after);
        for (const sibling of siblings) {
          assert.ok(recovered.openUserTasks.some(({ id }) => isDeepStrictEqual(id, sibling.id)),
            `${scenarioId}: ${command.commandId} reached ${sibling.id.elementId} activation ${sibling.id.activation}`);
        }
        isolatedCompletions++;
      }
      assert.ok(isolatedCompletions > 0, `${scenarioId} completes no activation beside a live sibling`);

      const handle = getTestProcessHandle(environment.client.workflow, instanceId);
      const terminal = await withDeadline(readTestProcessTerminalResult(handle), operationDeadlineMs,
        `${scenarioId} terminal result`);
      assert.equal((await published()).status, ProcessStatus.Completed);
      for (const commandId of committedCommandIds) {
        assert.equal(terminal.recoveryEntries.filter((entry) =>
          entry.commandId === commandId && entry.outcome === CommandOutcome.Committed).length, 1,
        `${scenarioId}: ${commandId} keeps one committed recovery entry after its repeated Update`);
      }

      const terminalBytes = workflowChainCanonicalUtf8ByteLength(terminal);
      assert.ok(terminalBytes <= workflowChainProductionLimit(WorkflowChainBudgetKind.TerminalResultEnvelopeBytes));
      const identity = { definition: program.identity, processId: program.processId, processInstanceId: instanceId };
      const [execution, occurrences] = await Promise.all([
        readPublicationUntilAnswered(`${scenarioId} E1 publication`, () => observeTemporalExecutionPublication(
          environment.client.workflow as unknown as TemporalExecutionPublicationClient, workflowId, identity,
          { afterRevision: 0 })),
        readPublicationUntilAnswered(`${scenarioId} E2 publication`, () => observeTemporalFlowNodeOccurrences(
          environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient, workflowId, identity,
          { afterRevision: 0 })),
      ]);
      assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
      assert.equal(occurrences.kind, FlowNodeOccurrencePublicationResultKind.Available);
      if (execution.kind !== ExecutionPublicationResultKind.Available ||
          occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available) assert.fail("publications must be available");
      // The whole journey fits one aligned page, so no schedule needs the remainder protocol.
      assert.equal(execution.page.pageThroughRevision, execution.page.headRevision);
      const publicationBytes = workflowChainCanonicalUtf8ByteLength(execution.page) +
        workflowChainCanonicalUtf8ByteLength(occurrences.page);
      assert.ok(publicationBytes <= workflowChainProductionLimit(WorkflowChainBudgetKind.QueryResponseBytes));
      t.diagnostic(`${scenarioId}: terminal ${terminalBytes} bytes, complete E1+E2 publication ${publicationBytes} bytes`);

      const trace: CanonicalObservation[] = [];
      for (const run of await workflowChainRuns(environment, workflowId)) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const history = await withDeadline(runHandle.fetchHistory(), operationDeadlineMs, `${scenarioId} history`);
        trace.push(...await withDeadline(runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName),
          operationDeadlineMs, `${scenarioId} trace`));
        await replayBpmnHistory(bundle, history, workflowId);
      }
      assert.deepEqual(trace, oracle.trace);
    }
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      try {
        await withDeadline(definitionRuntime.close(), operationDeadlineMs, "concurrent activations definition client teardown");
      } finally {
        await withDeadline(environment.teardown(), operationDeadlineMs, "concurrent activations Temporal teardown");
      }
    }
  }
});
