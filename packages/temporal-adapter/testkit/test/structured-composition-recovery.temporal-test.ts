import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { EngineDefinitionCompilationStatus, EngineDefinitionStartStatus,
  compileBpmnDefinition, startBpmnDefinitionVersion } from "@bpmn-lean/engine-api";
import type { WorkflowHandle } from "@temporalio/client";
import { createLazyTemporalClientRuntime } from "@bpmn-lean/temporal-client/definition-start";
import {
  CommandOutcome, ProcessStatus, ScenarioDocumentKind, ScenarioStepKind, StimulusKind,
  STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID,
  advanceScenario, initialState, observeStableState,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalObservation, CompleteUserTaskInstanceStimulus, RuntimeState, Scenario, SemanticProcessProgram,
  StartProcessStimulus, StateObservation, Stimulus, VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  BpmnWorkflowHostInputKind, ExecutionPublicationResultKind, FlowNodeOccurrencePublicationResultKind,
  WorkflowChainBudgetKind, bpmnProcessWorkflowType, bpmnSemanticTaskQueue, bpmnTraceQueryName,
  bpmnWorkflowContinuationV1, createCachedLocalEnvironment, getTestProcessHandle, loadBpmnWorkflowBundle, mutateConditionalSelection,
  observeTemporalExecutionPublication, observeTemporalFlowNodeOccurrences, processWorkflowId,
  readTestProcessTerminalResult, requireBpmnWorkflowContinuationStateV1, runBranchBypassMutation,
  submitUserTaskCompletion, workflowChainProductionLimit,
} from "@bpmn-lean/temporal-testkit";
import type {
  TemporalExecutionPublicationClient, TemporalFlowNodeOccurrencePublicationClient, TemporalHistory,
} from "@bpmn-lean/temporal-testkit";
import { binding, invoiceSource, serialSource } from "../../../differential/test/structured-composition-fixtures.ts";
import { createBusinessTaskHostOracle } from "./business-task-host-oracle.ts";
import { assertNoNonUpdateBpmnHostEvents, decodeJsonPayload, historyEvents } from "./temporal-history-facts.ts";
import { loadJson, temporalCacheDirectory, withDeadline } from "./temporal-test-support.ts";
import { replayBpmnHistory, startBpmnTestWorker, stopBpmnTestWorker } from "./temporal-worker-test-support.ts";
import type { WorkerLease } from "./temporal-worker-test-support.ts";
import { waitForPublishedWorkflowChainState, waitForWorkflowChainRunCount, workflowChainRuns } from "./workflow-chain-test-support.ts";

const summary = "Invoice 4711";
const operationDeadlineMs = 20_000;

async function compileComposition(name: string, xml: string): Promise<SemanticProcessProgram> {
  const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(xml),
    sourceId: name, expectedSha256: undefined, semanticProfile: STRUCTURED_PROCESS_COMPOSITION_CHECKPOINT_PROFILE_ID,
    sourceOverlay: null, limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) assert.fail("Expected admitted structured composition");
  return compiled.semanticProcess;
}

function compositionStart(program: SemanticProcessProgram, instanceId: string): StartProcessStimulus {
  return { kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
    instanceId, initialVariables: [binding("summary", summary)] };
}

function committed(program: SemanticProcessProgram, state: RuntimeState, stimulus: Stimulus): RuntimeState {
  const step = advanceScenario(program, state, stimulus);
  assert.equal(step.kind, ScenarioStepKind.Committed);
  if (step.kind !== ScenarioStepKind.Committed) assert.fail("Expected committed structured composition step");
  return step.state;
}

function assertCurrentTask(
  state: StateObservation | null, elementId: string, inputs: readonly VariableBinding[] | undefined,
): asserts state is StateObservation {
  assert.ok(state !== null);
  assert.equal(state.status, ProcessStatus.Running);
  assert.equal(state.openUserTasks.length, 1);
  assert.equal(state.openUserTasks[0]?.id.elementId, elementId);
  assert.deepEqual(state.openUserTasks[0]?.inputs, inputs);
}

test("structured composition public task assertion rejects branch bypass and lost copied input", async () => {
  const program = await compileComposition("structured-composition-discriminator", invoiceSource());
  const start = compositionStart(program, "composition-discriminator");
  const assessed = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "assess",
    taskId: { processInstanceId: start.instanceId, elementId: "assess", activation: 1 },
    submittedValues: [binding("assess_out", "approved")] } as const;
  const started = committed(program, initialState, start);
  const selected = committed(program, started, assessed);
  assertCurrentTask(observeStableState(program, selected), "approve", undefined);

  const bypassedProgram = mutateConditionalSelection(program);
  const bypassed = committed(bypassedProgram, committed(bypassedProgram, initialState, start), assessed);
  const bypassedObservation = observeStableState(bypassedProgram, bypassed);
  assertCurrentTask(bypassedObservation, "reject", undefined);
  assert.throws(() => assertCurrentTask(bypassedObservation, "approve", undefined), assert.AssertionError);

  const archived = committed(program, selected, { kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "approve", taskId: { processInstanceId: start.instanceId, elementId: "approve", activation: 1 },
    submittedValues: [] });
  const archive = observeStableState(program, archived);
  assertCurrentTask(archive, "archive", [binding("archive_in", "approved")]);
  assert.throws(() => assertCurrentTask({ ...archive,
    openUserTasks: archive.openUserTasks.map(({ inputs: _inputs, ...task }) => task),
  }, "archive", [binding("archive_in", "approved")]), assert.AssertionError);
});

test("registered composition preserves public input, routing and merge through replacement, recovery and replay", async () => {
  const environment = await withDeadline(createCachedLocalEnvironment({ identity: "structured-composition-recovery",
    downloadDirectory: temporalCacheDirectory }), 40_000, "structured composition Temporal environment startup");
  const definitionRuntime = createLazyTemporalClientRuntime({ address: environment.address,
    namespace: environment.client.options.namespace, connectTimeoutMs: 5000 });
  let worker: WorkerLease | undefined;
  try {
    const bundle = await loadBpmnWorkflowBundle();
    worker = await startBpmnTestWorker(environment, bundle, "structured-composition-original");
    for (const fixture of [
      { name: "invoice-approved", xml: invoiceSource(), decision: "approved", branch: "approve", scenario: null },
      { name: "serial-string", xml: serialSource, decision: "approved", branch: null, scenario: null },
      { name: "serial-null", xml: serialSource, decision: null, branch: null, scenario: null },
      { name: "public-invoice-approve", xml: null, decision: "approved", branch: "approve", scenario: "invoice-approve" },
      { name: "public-invoice-reject", xml: null, decision: "rejected", branch: "reject", scenario: "invoice-reject" },
      { name: "public-invoice-manual", xml: null, decision: null, branch: "manual", scenario: "invoice-manual" },
      { name: "public-serial-string", xml: null, decision: "approved", branch: null, scenario: "serial-string" },
      { name: "public-serial-null", xml: null, decision: null, branch: null, scenario: "serial-null" },
    ] as const) {
      const scenario = fixture.scenario === null ? null : await loadJson<Scenario>(new URL(
        `../../../../scenarios/structured-process-composition/${fixture.scenario}.scenario.json`, import.meta.url));
      const xml = scenario === null ? fixture.xml! : await readFile(new URL(`../../../../${scenario.bpmn.relativePath}`, import.meta.url), "utf8");
      const program = await compileComposition(scenario?.bpmn.id ?? fixture.name, xml);
      const registeredStart = scenario?.stimuli[0];
      assert.ok(scenario === null || registeredStart?.kind === StimulusKind.StartProcess);
      const start = registeredStart?.kind === StimulusKind.StartProcess ?
        { ...registeredStart, commandId: `start:${registeredStart.instanceId}` } :
        compositionStart(program, `structured-host-${fixture.name}`);
      const workflowId = processWorkflowId(start.instanceId);
      const oracle = createBusinessTaskHostOracle(environment, program, start);
      let handle: WorkflowHandle;
      if (scenario === null) {
        // The approved hosting preflight retains lower-only rollover witnesses separately from public starts.
        handle = await withDeadline(environment.client.workflow.start(bpmnProcessWorkflowType, {
          args: [start, program, { protocol: bpmnWorkflowContinuationV1, kind: BpmnWorkflowHostInputKind.Initial,
            eventHistoryEventLimit: 4,
            eventHistoryByteLimit: workflowChainProductionLimit(WorkflowChainBudgetKind.EventHistoryBytes) }],
          workflowId, taskQueue: bpmnSemanticTaskQueue, workflowIdReusePolicy: "REJECT_DUPLICATE",
        }), operationDeadlineMs, "structured composition forced-rollover start");
      } else {
        const request = { bytes: new TextEncoder().encode(xml), sourceId: scenario.bpmn.id,
          expectedSha256: scenario.bpmn.sha256, semanticProfile: scenario.profile, sourceOverlay: null,
          limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1000 } };
        const compiled = await compileBpmnDefinition(request);
        assert.equal(compiled.status, EngineDefinitionCompilationStatus.Accepted);
        assert.equal(program.identity.sourceSha256, scenario.bpmn.sha256);
        const started = await startBpmnDefinitionVersion({ ...request, temporalClient: definitionRuntime.client,
          expectedProcessId: start.processId, processInstanceId: start.instanceId,
          initialVariables: start.initialVariables, taskQueue: bpmnSemanticTaskQueue });
        assert.equal(started.status, EngineDefinitionStartStatus.Started);
        handle = getTestProcessHandle(environment.client.workflow, start.instanceId);
      }
      oracle.advance(start);
      const initialExpected = oracle.state;

      async function currentAfter(previous?: StateObservation): Promise<StateObservation> {
        const current = await waitForPublishedWorkflowChainState(environment, workflowId, program, start.instanceId,
          state => previous === undefined ? state.openUserTasks.length === 1 :
            state.status === ProcessStatus.Completed || !state.openUserTasks.some(task =>
              isDeepStrictEqual(task.id, previous.openUserTasks[0]?.id)));
        assert.deepEqual(current, observeStableState(program, oracle.state));
        await oracle.assertPublications();
        return current;
      }

      async function completeTask(
        current: StateObservation, commandId: string, submittedValues: readonly VariableBinding[],
      ): Promise<CompleteUserTaskInstanceStimulus> {
        const task = current.openUserTasks[0];
        assert.ok(task !== undefined);
        const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId, taskId: task.id, submittedValues } as const;
        assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, command),
          { kind: "semantic", commandId, outcome: CommandOutcome.Committed });
        oracle.advance(command);
        return command;
      }

      const assess = await currentAfter();
      assertCurrentTask(assess, "assess", [binding("assess_in", summary)]);
      assert.deepEqual(assess.variables, [binding("summary", summary)]);
      const refused = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "wrong-output-name",
        taskId: assess.openUserTasks[0]!.id, submittedValues: [binding("decision", fixture.decision)] } as const;
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, refused),
        { kind: "semantic", commandId: refused.commandId, outcome: CommandOutcome.Rejected });
      const refusal = advanceScenario(program, oracle.state, refused);
      assert.equal(refusal.kind, ScenarioStepKind.Terminal);
      if (refusal.kind !== ScenarioStepKind.Terminal) assert.fail("Expected wrong output-name refusal");
      assert.deepEqual(refusal.state, oracle.state);
      oracle.trace.push(...refusal.observations);
      // As in the composed Activity-data preflight, a refused Update wakes the passive host checkpoint.
      if (scenario === null) await waitForWorkflowChainRunCount(environment, workflowId, 2);
      assert.deepEqual(await currentAfter(), assess);

      await stopBpmnTestWorker(worker!);
      worker = undefined;
      worker = await startBpmnTestWorker(environment, bundle, `structured-composition-replacement-${fixture.name}`);
      const replaced = await currentAfter();
      assertCurrentTask(replaced, "assess", [binding("assess_in", summary)]);
      assert.deepEqual(replaced, assess);

      const assessed = await completeTask(replaced, "assess", [binding("assess_out", fixture.decision)]);
      let continuation = await currentAfter(replaced);
      const mappedVariables = [binding("decision", fixture.decision), binding("summary", summary)];
      assert.deepEqual(continuation.variables, mappedVariables);
      if (fixture.branch !== null) {
        assertCurrentTask(continuation, fixture.branch, undefined);
        const selected = continuation;
        await completeTask(selected, fixture.branch, []);
        continuation = await currentAfter(selected);
      }
      assertCurrentTask(continuation, "archive", [binding("archive_in", fixture.decision)]);
      assert.deepEqual(continuation.variables, mappedVariables);
      assert.notDeepEqual(continuation.openUserTasks[0]!.id, assess.openUserTasks[0]!.id);
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, assessed),
        { kind: "semantic", commandId: assessed.commandId, outcome: CommandOutcome.Committed });
      assert.deepEqual(await currentAfter(), continuation);

      const archived = await completeTask(continuation, "archive", [binding("archive_out", "saved")]);
      const terminal = await withDeadline(readTestProcessTerminalResult(handle), operationDeadlineMs,
        "structured composition terminal result");
      const completed = await currentAfter(continuation);
      assert.equal(completed.status, ProcessStatus.Completed);
      assert.deepEqual(completed.openUserTasks, []);
      assert.deepEqual(completed.variables,
        [binding("decision", fixture.decision), binding("receipt", "saved"), binding("summary", summary)]);
      assert.deepEqual(terminal.receipt.finalState, completed);
      assert.deepEqual(terminal.receipt.definition, program.identity);
      assert.equal(terminal.receipt.processInstanceId, start.instanceId);
      assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId, archived),
        { kind: "semantic", commandId: archived.commandId, outcome: CommandOutcome.Committed });
      assert.equal(terminal.recoveryEntries.filter(entry => entry.commandId === archived.commandId &&
        entry.outcome === CommandOutcome.Committed).length, 1);
      await oracle.assertPublications();

      const trace: CanonicalObservation[] = [];
      let carriedInput = 0;
      const runs = await workflowChainRuns(environment, workflowId);
      assert.ok(runs.length >= (scenario === null ? 2 : 1));
      for (const run of runs) {
        const runHandle = environment.client.workflow.getHandle(workflowId, run.runId);
        const history = await withDeadline(runHandle.fetchHistory(), operationDeadlineMs,
          "structured composition retained history");
        trace.push(...await withDeadline(runHandle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName),
          operationDeadlineMs, "structured composition retained trace"));
        assertNoNonUpdateBpmnHostEvents(history as TemporalHistory, fixture.name);
        for (const event of historyEvents(history as TemporalHistory, "workflowExecutionContinuedAsNewEventAttributes")) {
          const attributes = event["workflowExecutionContinuedAsNewEventAttributes"] as { input: { payloads: unknown[] } };
          const carried = requireBpmnWorkflowContinuationStateV1(decodeJsonPayload(attributes.input.payloads[3]), program, start.instanceId);
          if (carried.userTaskWaits[0]?.id.elementId === "assess") {
            assert.deepEqual(carried, initialExpected);
            assertCurrentTask(observeStableState(program, carried), "assess", [binding("assess_in", summary)]);
            carriedInput++;
          }
        }
        await replayBpmnHistory(bundle, history, workflowId);
      }
      if (scenario === null) assert.ok(carriedInput > 0);
      assert.deepEqual(trace, oracle.trace);
    }

    {
      const program = await compileComposition("structured-composition-host-bypass", invoiceSource());
      const start = compositionStart(program, "structured-host-branch-bypass");
      const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id: "structured-composition-host-bypass",
        profile: program.identity.semanticProfile, bpmn: { id: program.identity.sourceId,
          sha256: program.identity.sourceSha256, sourceOverlay: null, relativePath: "invoice.bpmn" },
        stimuli: [start], observations: [], provenance: { normativeRefs: ["BPMN 2.0.2 Clause 13.4.2"],
          cibRevision: "not-applicable", cibRefs: [] } };
      await runBranchBypassMutation(environment, scenario, program, processWorkflowId(start.instanceId), async handle => {
        const assess = await waitForPublishedWorkflowChainState(environment, handle.workflowId, program, start.instanceId,
          state => state.openUserTasks.length === 1);
        assertCurrentTask(assess, "assess", [binding("assess_in", summary)]);
        assert.deepEqual(await submitUserTaskCompletion(environment.client.workflow, start.instanceId,
          { kind: StimulusKind.CompleteUserTaskInstance, commandId: "assess",
            taskId: assess.openUserTasks[0]!.id, submittedValues: [binding("assess_out", "approved")] }),
        { kind: "semantic", commandId: "assess", outcome: CommandOutcome.Committed });
        await waitForPublishedWorkflowChainState(environment, handle.workflowId, program, start.instanceId,
          state => !state.openUserTasks.some(task => isDeepStrictEqual(task.id, assess.openUserTasks[0]!.id)));
        const identity = { definition: program.identity, processId: program.processId, processInstanceId: start.instanceId };
        const [execution, occurrences] = await Promise.all([
          observeTemporalExecutionPublication(environment.client.workflow as unknown as TemporalExecutionPublicationClient,
            handle.workflowId, identity, { afterRevision: 0 }),
          observeTemporalFlowNodeOccurrences(environment.client.workflow as unknown as TemporalFlowNodeOccurrencePublicationClient,
            handle.workflowId, identity, { afterRevision: 0 }),
        ]);
        assert.equal(execution.kind, ExecutionPublicationResultKind.Available);
        assert.equal(occurrences.kind, FlowNodeOccurrencePublicationResultKind.Available);
        if (execution.kind !== ExecutionPublicationResultKind.Available ||
            occurrences.kind !== FlowNodeOccurrencePublicationResultKind.Available) assert.fail("Mutation publications must be available");
        assert.ok(execution.page.current !== null && occurrences.page.currentOpen !== null);
        assertCurrentTask(execution.page.current.state, "reject", undefined);
        assert.throws(() => assertCurrentTask(execution.page.current!.state, "approve", undefined), assert.AssertionError);
        assert.deepEqual(occurrences.page.currentOpen.map(fact => fact.elementId), ["reject"]);
        return withDeadline(handle.query<readonly CanonicalObservation[]>(bpmnTraceQueryName), operationDeadlineMs,
          "structured composition branch-bypass trace");
      });
    }
  } finally {
    try {
      if (worker !== undefined) await stopBpmnTestWorker(worker);
    } finally {
      try {
        await withDeadline(definitionRuntime.close(), operationDeadlineMs, "structured composition definition client teardown");
      } finally {
        await withDeadline(environment.teardown(), operationDeadlineMs, "structured composition Temporal teardown");
      }
    }
  }
});
