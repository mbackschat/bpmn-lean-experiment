import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CanonicalObservationKind, CommandOutcome, REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  MessageChannelKind, ScenarioStepKind, StimulusKind, VariableValueKind, advanceScenario, initialState,
} from "@bpmn-lean/semantic-core";
import type { CanonicalObservation, RuntimeState, Stimulus } from "@bpmn-lean/semantic-core";
import {
  bpmnCompleteUserTaskUpdateName, bpmnProcessWorkflowType, bpmnTraceQueryName,
  bpmnDeliverMessageSignalName, bpmnDeliverCorrelatedMessageUpdateName,
  bpmnRetryEffectIncidentUpdateName, bpmnCancelIncidentProcessUpdateName,
  productionBpmnWorkflowInitialHostInput,
  timerFiringStimulus, requireWorkflowTerminalResultV1,
  bpmnWorkflowChainPatchId,
} from "@bpmn-lean/temporal-protocol";
import { loadBpmnWorkflowBundle } from "@bpmn-lean/temporal-testkit";
import { parseWorkflowCode } from "@temporalio/worker/lib/worker.js";
import { defaultPayloadConverter } from "@temporalio/workflow";
import { commands, completedWorkflowResult, requireStartedTimer, runDirectVmActivations, workflowFailureType } from "./direct-vm-activation-harness.ts";
import type { Activation, Completion } from "./direct-vm-activation-harness.ts";
import { validateIncomingWorkflowContinuation } from "@bpmn-lean/temporal-workflow";

const compilation = await compileBpmnToSemanticProcess({
  bytes: await readFile(new URL("../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-timer.bpmn", import.meta.url)),
  sourceId: "subscription-host-direct-vm", expectedSha256: undefined, sourceOverlay: null,
  semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
});
assert.equal(compilation.status, BpmnCompilationStatus.Accepted);
if (compilation.status !== BpmnCompilationStatus.Accepted) throw new Error("subscription fixture refused");
const program = compilation.semanticProcess;
const start = {
  kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
  instanceId: "subscription-direct-vm", initialVariables: [],
} as const;
const started = advanceScenario(program, initialState, start);
assert.equal(started.kind, ScenarioStepKind.Committed);
if (started.kind !== ScenarioStepKind.Committed) throw new Error("subscription Start refused");
const initialTimer = started.state.timerWaits[0]!;
const task = started.state.userTaskWaits.find(({ id }) => id.elementId === "UserTask_Sibling");
assert.ok(task);
const completion = {
  kind: StimulusKind.CompleteUserTaskInstance, commandId: "complete-host", taskId: task.id, submittedValues: [],
} as const;
const bundle = parseWorkflowCode((await loadBpmnWorkflowBundle()).code);
const queryJobs = [{ variant: "queryWorkflow", queryWorkflow: {
  queryId: "trace", queryType: bpmnTraceQueryName, arguments: [], headers: {},
} }];

test("production subscription host rearms a fresh native Timer after each committed firing", async () => {
  const completions = await activate([{ fireTimer: { seq: 1 } }], [
    [{ fireTimer: { seq: 2 } }], queryJobs,
  ]);
  requireStartedTimer(completions[0]!, 2);
  requireStartedTimer(completions[1]!, 3);
  const trace = queriedTrace(completions[2]!);
  const state = trace.filter(({ kind }) => kind === CanonicalObservationKind.State).at(-1);
  assert.ok(state?.kind === CanonicalObservationKind.State);
  assert.equal(state.openUserTasks.filter(({ id }) => id.elementId === "HandleReminder").length, 2);
});

test("production subscription host fixes completion before Timer regardless of callback order", async () => {
  const update = { doUpdate: {
    id: completion.commandId, protocolInstanceId: completion.commandId,
    name: bpmnCompleteUserTaskUpdateName, input: [defaultPayloadConverter.toPayload(completion)],
    runValidator: false,
  } };
  for (const jobs of [[update, { fireTimer: { seq: 1 } }], [{ fireTimer: { seq: 1 } }, update]]) {
    const completions = await activate(jobs, [queryJobs]);
    const outcomes = queriedTrace(completions[1]!).filter((entry) => entry.kind === CanonicalObservationKind.Command);
    assert.deepEqual(outcomes.map((entry) => [entry.commandId, entry.outcome]), [
      [start.commandId, CommandOutcome.Committed],
      [completion.commandId, CommandOutcome.Committed],
      [timerFiringStimulus(started.state.timerWaits[0]!).commandId, CommandOutcome.Rejected],
    ]);
    assert.equal(commands(completions[0]!).some(({ startTimer }) => startTimer !== undefined), false);
    assert.equal(commands(completions[0]!).filter(({ updateResponse }) => updateResponse?.completed !== undefined).length, 1);
  }
});

test("subscription rollover carries the replacement occurrence and its original due time", async () => {
  const completions = await activate([{ fireTimer: { seq: 1 } }], [], true);
  const successor = commands(completions[0]!).find(({ continueAsNewWorkflowExecution }) =>
    continueAsNewWorkflowExecution !== undefined)?.continueAsNewWorkflowExecution;
  assert.ok(successor);
  const args = successor.arguments?.map((value) => defaultPayloadConverter.fromPayload(value));
  assert.ok(args);
  const host = args[2] as { subscriptionTimer?: unknown };
  const state = args[3] as { timerWaits: { id: unknown; deadlineMs: number }[] };
  assert.deepEqual(host.subscriptionTimer, {
    protocol: "bpmn-lean.subscription-timer.v1",
    timer: { id: state.timerWaits[0]?.id, logicalDeadlineMs: 2_000, dueTimeMs: 2_000 },
  });
  const validHost = args[2] as { firstExecutionRunId: string; subscriptionTimer: {
    protocol: string; timer: { id: { activation: number }; logicalDeadlineMs: number; dueTimeMs: number };
  } };
  const incoming = (value: unknown) => validateIncomingWorkflowContinuation(
    start, program, value, args[3], args[4], args[5], validHost.firstExecutionRunId, args[6], args.length === 7,
  );
  assert.doesNotThrow(() => incoming(validHost));
  const { subscriptionTimer: binding, ...missingBinding } = validHost;
  for (const malformed of [
    missingBinding,
    { ...validHost, subscriptionTimer: { ...binding, timer: null } },
    { ...validHost, subscriptionTimer: { ...binding, timer: { ...binding.timer, logicalDeadlineMs: 2_001 } } },
    { ...validHost, subscriptionTimer: { ...binding, timer: { ...binding.timer, id: { ...binding.timer.id, activation: 1 } } } },
  ]) {
    assert.throws(() => incoming(malformed), (error: unknown) =>
      error instanceof Error && Reflect.get(error, "type") === "BpmnWorkflowContinuationInvalid");
  }
  assert.equal(commands(completions[0]!).some(({ startTimer }) => startTimer !== undefined), false);
  for (const [initialNowMs, expectedDelay] of [[1_700, 300], [2_500, 1]] as const) {
    await runDirectVmActivations({
      bundle, workflowType: bpmnProcessWorkflowType, replaying: false, taskQueue: "subscription-direct-vm",
      args: args.map((value) => defaultPayloadConverter.toPayload(value)), readyJobs: queryJobs,
      initialNowMs,
      assertInitialization(value) {
        assert.equal(value.failed, undefined);
        assert.equal(workflowFailureType(value), undefined);
        const timer = commands(value).find(({ startTimer }) => startTimer !== undefined)?.startTimer;
        assert.ok(timer?.startToFireTimeout);
        assert.equal(Number(timer.startToFireTimeout.seconds) * 1_000 + Number(timer.startToFireTimeout.nanos) / 1_000_000, expectedDelay);
      },
    });
  }
});

test("unfired subscription rollover cancels the native Timer and preserves its remaining deadline", async () => {
  const audit = started.state.userTaskWaits.find(({ id }) => id.elementId === "IndependentAudit");
  assert.ok(audit);
  const stimulus = { ...completion, commandId: "complete-audit", taskId: audit.id };
  for (const replaying of [false, true]) {
    const values = await runDirectVmActivations({
      bundle, workflowType: bpmnProcessWorkflowType, replaying, sdkFlags: [2],
      replayPatches: [bpmnWorkflowChainPatchId],
      taskQueue: "subscription-unfired-rollover", activationStepMs: 400,
      args: [start, program, { ...productionBpmnWorkflowInitialHostInput(), eventHistoryEventLimit: 4 }]
        .map((value) => defaultPayloadConverter.toPayload(value)),
      readyJobs: [completionJob(stimulus)],
      assertInitialization(value) { requireStartedTimer(value, 1); },
    });
    const emitted = commands(values[0]!);
    assert.equal(workflowFailureType(values[0]!), undefined);
    assert.equal(emitted.filter(({ updateResponse }) => updateResponse?.completed !== undefined).length, 1);
    assert.equal(emitted.filter(({ cancelTimer }) => cancelTimer?.seq === 1).length, 1);
    const successor = emitted.find(({ continueAsNewWorkflowExecution }) => continueAsNewWorkflowExecution !== undefined)
      ?.continueAsNewWorkflowExecution;
    assert.ok(successor);
    const args = successor.arguments?.map((value) => defaultPayloadConverter.fromPayload(value));
    assert.ok(args);
    assert.deepEqual((args[2] as { subscriptionTimer: unknown }).subscriptionTimer, {
      protocol: "bpmn-lean.subscription-timer.v1",
      timer: { id: started.state.timerWaits[0]!.id, logicalDeadlineMs: 1_000, dueTimeMs: 1_000 },
    });
    assert.equal(emitted.some(({ startTimer }) => startTimer !== undefined), false);
    const continued = await runDirectVmActivations({
      bundle, workflowType: bpmnProcessWorkflowType, replaying, sdkFlags: [2], initialNowMs: 700,
      replayPatches: [bpmnWorkflowChainPatchId],
      taskQueue: "subscription-unfired-rollover", args: args.map((value) => defaultPayloadConverter.toPayload(value)),
      readyJobs: queryJobs,
      assertInitialization(value) {
        assert.equal(workflowFailureType(value), undefined);
        const timer = commands(value).find(({ startTimer }) => startTimer !== undefined)?.startTimer;
        assert.ok(timer?.startToFireTimeout);
        assert.equal(Number(timer.startToFireTimeout.seconds) * 1_000 + Number(timer.startToFireTimeout.nanos) / 1_000_000, 300);
      },
    });
    const outcomes = queriedTrace(continued[0]!).filter((entry) => entry.kind === CanonicalObservationKind.Command);
    assert.equal(outcomes.some(({ commandId }) => commandId === timerFiringStimulus(started.state.timerWaits[0]!).commandId), false);
  }
});

test("terminal subscription closure settles every accepted Update after the terminating command", async () => {
  const bytes = await readFile(new URL("../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-timer.bpmn", import.meta.url));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: Buffer.from(bytes.toString("utf8").replace(
      '<bpmn:incoming>Flow_OuterToEnd</bpmn:incoming>',
      '<bpmn:incoming>Flow_OuterToEnd</bpmn:incoming><bpmn:terminateEventDefinition />',
    )),
    sourceId: "subscription-terminal-drain", expectedSha256: undefined, sourceOverlay: null,
    semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
  if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Terminal fixture refused");
  const terminalProgram = compiled.semanticProcess;
  const initial = advanceScenario(terminalProgram, initialState, start);
  assert.equal(initial.kind, ScenarioStepKind.Committed);
  if (initial.kind !== ScenarioStepKind.Committed) throw new Error("Terminal Start refused");
  const trigger = initial.state.userTaskWaits.find(({ id }) => id.elementId === "UserTask_Trigger");
  assert.ok(trigger);
  const leaveChild = { ...completion, commandId: "leave-child", taskId: trigger.id };
  const afterChild = advanceScenario(terminalProgram, initial.state, leaveChild);
  assert.equal(afterChild.kind, ScenarioStepKind.Committed);
  if (afterChild.kind !== ScenarioStepKind.Committed) throw new Error("Child termination refused");
  const outer = afterChild.state.userTaskWaits.find(({ id }) => id.elementId === "UserTask_Outer");
  const audit = afterChild.state.userTaskWaits.find(({ id }) => id.elementId === "IndependentAudit");
  assert.ok(outer);
  assert.ok(audit);
  const close = { ...completion, commandId: "a-terminal", taskId: outer.id };
  const stale = { ...completion, commandId: "z-stale", taskId: audit.id };
  const unrelated = unrelatedIngress(terminalProgram.identity);
  for (const replaying of [false, true]) {
    const jobs = [completionJob(close), completionJob(stale), ...unrelated.jobs];
    for (const ready of [jobs, [...jobs].reverse()]) {
      const values = await runDirectVmActivations({
        bundle, workflowType: bpmnProcessWorkflowType, replaying, sdkFlags: [2], taskQueue: "subscription-terminal-drain",
        replayPatches: [bpmnWorkflowChainPatchId],
        args: [start, terminalProgram, productionBpmnWorkflowInitialHostInput()].map((value) => defaultPayloadConverter.toPayload(value)),
        readyJobs: [completionJob(leaveChild)],
        assertInitialization(value) { requireStartedTimer(value, 1); },
      }, [ready]);
      assert.equal(commands(values[0]!).filter(({ cancelTimer }) => cancelTimer?.seq === 1).length, 1);
      assert.equal(workflowFailureType(values[1]!), undefined);
      const terminal = requireWorkflowTerminalResultV1(completedWorkflowResult(values[1]!));
      assert.deepEqual(terminal.entries.map(({ commandId, outcome }) => [commandId, outcome]), [
        [leaveChild.commandId, CommandOutcome.Committed],
        [close.commandId, CommandOutcome.Committed],
        [stale.commandId, CommandOutcome.Rejected],
        ...unrelated.messages.map(({ commandId }) => [commandId, CommandOutcome.Rejected]),
        ...unrelated.incidents.map(({ commandId }) => [commandId, CommandOutcome.Rejected]),
      ]);
      assert.equal(terminal.receipt.finalState.openUserTasks.length, 0);
      const emitted = commands(values[1]!);
      assert.equal(emitted.filter(({ updateResponse }) => updateResponse?.completed !== undefined).length, 5);
      assert.ok(emitted.findIndex(({ completeWorkflowExecution }) => completeWorkflowExecution !== undefined) >
        emitted.findLastIndex(({ updateResponse }) => updateResponse?.completed !== undefined));
    }
  }
});

test("all accepted ingress shares the subscription activation order on execution and flagged replay", async () => {
  const unrelated = unrelatedIngress(program.identity);
  const batch = [completionJob(completion), ...unrelated.jobs, { fireTimer: { seq: 1 } }];
  const expected = [completion.commandId, ...unrelated.messages.map(({ commandId }) => commandId),
    timerFiringStimulus(started.state.timerWaits[0]!).commandId, ...unrelated.incidents.map(({ commandId }) => commandId)];
  for (const replaying of [false, true]) {
    for (let offset = 0; offset < batch.length; offset += 1) {
      const rotation = [...batch.slice(offset), ...batch.slice(0, offset)];
      for (const jobs of [rotation, [...rotation].reverse()]) {
        const completions = await activate(jobs, [queryJobs], false, replaying);
        const outcomes = queriedTrace(completions[1]!).filter((entry) => entry.kind === CanonicalObservationKind.Command).slice(1);
        assert.deepEqual(outcomes.map(({ commandId }) => commandId), expected);
        assert.deepEqual(outcomes.map(({ outcome }) => outcome), [CommandOutcome.Committed, ...Array(6).fill(CommandOutcome.Rejected)]);
        assert.equal(commands(completions[0]!).filter(({ updateResponse }) => updateResponse?.completed !== undefined).length, 4);
      }
    }
    const values = await activate(batch, [], true, replaying);
    const emitted = commands(values[0]!);
    const successor = emitted.find(({ continueAsNewWorkflowExecution }) => continueAsNewWorkflowExecution !== undefined)
      ?.continueAsNewWorkflowExecution;
    assert.ok(successor);
    const args = successor.arguments?.map((value) => defaultPayloadConverter.fromPayload(value));
    assert.ok(args);
    const recovery = args[4] as { entries: { commandId: string; outcome: CommandOutcome }[] };
    assert.deepEqual(recovery.entries.map(({ commandId }) => commandId), expected.filter((id) =>
      id !== timerFiringStimulus(started.state.timerWaits[0]!).commandId));
    assert.equal(emitted.filter(({ updateResponse }) => updateResponse?.completed !== undefined).length, 4);
    assert.ok(emitted.findIndex(({ continueAsNewWorkflowExecution }) => continueAsNewWorkflowExecution !== undefined) >
      emitted.findLastIndex(({ updateResponse }) => updateResponse?.completed !== undefined));
  }
});

test("repeated Message deliveries preserve multiplicity, retry identity, and exact boundary lifetime", async () => {
  const bytes = await readFile(new URL("../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/boundary-message.bpmn", import.meta.url));
  for (const interrupting of [false, true]) {
    const compiled = await compileBpmnToSemanticProcess({
      bytes: interrupting ? Buffer.from(bytes.toString("utf8").replace('cancelActivity="false"', 'cancelActivity="true"')) : bytes,
      sourceId: `subscription-message-${String(interrupting)}`, expectedSha256: undefined, sourceOverlay: null,
      semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
      limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
    });
    assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
    if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Message fixture refused");
    const messageProgram = compiled.semanticProcess;
    const initial = advanceScenario(messageProgram, initialState, start);
    assert.equal(initial.kind, ScenarioStepKind.Committed);
    if (initial.kind !== ScenarioStepKind.Committed) throw new Error("Message Start refused");
    const subscription = initial.state.messageWaits[0];
    assert.ok(subscription);
    const a = { kind: StimulusKind.DeliverMessage, commandId: "a-message", subscriptionId: subscription.id, channel: subscription.channel } as const;
    const b = { ...a, commandId: "b-message" };
    const stale = { ...a, commandId: "stale-message" };
    const invalid = { ...completion, commandId: "invalid-completion", taskId: { ...completion.taskId, activation: 99 } };
    const signal = (stimulus: Stimulus) => ({ signalWorkflow: {
      signalName: bpmnDeliverMessageSignalName, input: [defaultPayloadConverter.toPayload(stimulus)],
    } });
    const update = (stimulus: typeof completion | typeof invalid) => ({ doUpdate: {
      name: bpmnCompleteUserTaskUpdateName, id: stimulus.commandId, protocolInstanceId: stimulus.commandId,
      input: [defaultPayloadConverter.toPayload(stimulus)], runValidator: true,
    } });
    const expected: CanonicalObservation[] = [{ kind: CanonicalObservationKind.Deployment, outcome: CommandOutcome.Committed }];
    let state = initialState;
    for (const stimulus of [start, invalid, a, b, completion, stale]) {
      const step = advanceScenario(messageProgram, state, stimulus);
      assert.notEqual(step.kind, ScenarioStepKind.HarnessFailure);
      if (step.kind === ScenarioStepKind.HarnessFailure) throw new Error("Message schedule failed");
      state = step.state;
      expected.push(...step.observations);
    }
    for (const replaying of [false, true]) {
      for (const readyJobs of [[signal(b), update(invalid), signal(a), signal(a)], [signal(a), signal(a), update(invalid), signal(b)]]) {
        const values = await runDirectVmActivations({
          bundle, workflowType: bpmnProcessWorkflowType, replaying, sdkFlags: [2], taskQueue: "subscription-messages",
          replayPatches: [bpmnWorkflowChainPatchId],
          args: [start, messageProgram, productionBpmnWorkflowInitialHostInput()].map((value) => defaultPayloadConverter.toPayload(value)), readyJobs,
          assertInitialization(value) { assert.equal(workflowFailureType(value), undefined); },
        }, [[update(completion)], [signal(stale)], queryJobs]);
        assert.deepEqual(queriedTrace(values[3]!), expected);
        const final = expected.filter((entry) => entry.kind === CanonicalObservationKind.State).at(-1);
        assert.ok(final);
        assert.equal(final.openUserTasks.filter(({ id }) => id.elementId === "HandleReminder").length, interrupting ? 1 : 2);
        assert.equal(final.openMessageSubscriptions.length, 0);
        for (const value of values) {
          assert.equal(value.failed, undefined);
          assert.equal(workflowFailureType(value), undefined);
          assert.equal(commands(value).some(({ startTimer }) => startTimer !== undefined), false);
        }
      }
    }
  }
});

test("the production scheduler preserves the complete core trace across every selected catch and Timer host", async () => {
  for (const name of ["catch-message", "receive-task", "catch-timer", "boundary-timer", "subprocess-boundary-timer"]) {
    const original = await readFile(new URL(`../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/${name}.bpmn`, import.meta.url), "utf8");
    const modes = name.endsWith("boundary-timer") ? ["repeat", "one-shot", "interrupting"] : ["one-shot"];
    for (const mode of modes) {
      let xml = mode === "repeat" ? original : original.replace(
        "<bpmn:timeCycle>R/PT1S</bpmn:timeCycle>", "<bpmn:timeDuration>PT1S</bpmn:timeDuration>");
      if (mode === "interrupting") xml = xml.replace('cancelActivity="false"', 'cancelActivity="true"');
      const compiled = await compileBpmnToSemanticProcess({
        bytes: Buffer.from(xml), sourceId: `${name}-${mode}-host`, expectedSha256: undefined, sourceOverlay: null,
        semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
      });
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Locus fixture refused");
      const selected = compiled.semanticProcess;
      let state: RuntimeState = initialState;
      const expected: CanonicalObservation[] = [{ kind: CanonicalObservationKind.Deployment, outcome: CommandOutcome.Committed }];
      const batches: NonNullable<Activation["jobs"]>[] = [];
      const prefixes: CanonicalObservation[][] = [];
      const apply = (stimulus: Stimulus) => {
        const step = advanceScenario(selected, state, stimulus);
        assert.equal(step.kind, ScenarioStepKind.Committed);
        if (step.kind !== ScenarioStepKind.Committed) throw new Error("Locus command refused");
        state = step.state;
        expected.push(...step.observations);
      };
      const enqueue = (stimulus: Stimulus, job: NonNullable<Activation["jobs"]>[number]) => {
        apply(stimulus);
        batches.push([job]);
        if (state.control.kind !== "completed") {
          batches.push(queryJobs);
          prefixes.push([...expected]);
        }
      };
      apply(start);
      const audit = state.userTaskWaits.find(({ id }) => id.elementId === "IndependentAudit");
      assert.ok(audit);
      const finishAudit = { ...completion, commandId: "finish-audit", taskId: audit.id };
      enqueue(finishAudit, completionJob(finishAudit));
      if (state.timerWaits.length > 0) {
        for (let seq = 1; seq <= (mode === "repeat" ? 2 : 1); seq += 1) {
          const timer = state.timerWaits[0];
          assert.ok(timer);
          enqueue(timerFiringStimulus(timer), { fireTimer: { seq } });
        }
      } else {
        const message = state.messageWaits[0];
        assert.ok(message);
        const stimulus = { kind: StimulusKind.DeliverMessage, commandId: "resume-catch", subscriptionId: message.id, channel: message.channel } as const;
        enqueue(stimulus, { signalWorkflow: {
          signalName: bpmnDeliverMessageSignalName, input: [defaultPayloadConverter.toPayload(stimulus)],
        } });
      }
      for (let count = 0; state.control.kind !== "completed" && count < 8; count += 1) {
        const task = state.userTaskWaits.find(({ id }) => id.elementId === "UserTask_Trigger") ?? state.userTaskWaits[0];
        assert.ok(task);
        const stimulus = { ...completion, commandId: `finish-${task.id.elementId}-${task.id.activation}`, taskId: task.id };
        enqueue(stimulus, completionJob(stimulus));
      }
      assert.equal(state.control.kind, "completed");
      for (const replaying of [false, true]) {
        const values = await runDirectVmActivations({
          bundle, workflowType: bpmnProcessWorkflowType, replaying, sdkFlags: [2], replayPatches: [bpmnWorkflowChainPatchId],
          taskQueue: "subscription-loci", args: [start, selected, productionBpmnWorkflowInitialHostInput()]
            .map((value) => defaultPayloadConverter.toPayload(value)), readyJobs: batches[0]!,
          assertInitialization(value) {
            assert.equal(value.failed, undefined);
            assert.equal(workflowFailureType(value), undefined);
            if (name.endsWith("timer")) requireStartedTimer(value, 1);
          },
        }, batches.slice(1));
        let queryIndex = 0;
        for (const [index, value] of values.entries()) {
          assert.equal(value.failed, undefined, `${name}/${mode}/${index}`);
          assert.equal(workflowFailureType(value), undefined, `${name}/${mode}/${index}`);
          if (batches[index] === queryJobs) assert.deepEqual(queriedTrace(value), prefixes[queryIndex++], `${name}/${mode}/${index}`);
        }
        const result = requireWorkflowTerminalResultV1(completedWorkflowResult(values.at(-1)!));
        assert.deepEqual(result.receipt.finalState, expected.filter((entry) => entry.kind === CanonicalObservationKind.State).at(-1));
      }
    }
  }
});

async function activate(jobs: NonNullable<Activation["jobs"]>, later: ReadonlyArray<NonNullable<Activation["jobs"]>>, rollover = false, replaying = false) {
  const completions = await runDirectVmActivations({
    bundle, workflowType: bpmnProcessWorkflowType, replaying, sdkFlags: [2], taskQueue: "subscription-direct-vm",
    replayPatches: [bpmnWorkflowChainPatchId],
    args: [start, program, { ...productionBpmnWorkflowInitialHostInput(), ...(rollover ? { eventHistoryEventLimit: 4 } : {}) }]
      .map((value) => defaultPayloadConverter.toPayload(value)), readyJobs: jobs,
    assertInitialization(value) {
      assert.equal(value.failed, undefined);
      assert.equal(workflowFailureType(value), undefined);
      requireStartedTimer(value, 1);
    },
  }, later);
  for (const value of completions) {
    assert.equal(value.failed, undefined);
    assert.equal(workflowFailureType(value), undefined);
  }
  return completions;
}

function queriedTrace(value: Completion): CanonicalObservation[] {
  const response = commands(value).find(({ respondToQuery }) => respondToQuery?.queryId === "trace")?.respondToQuery;
  assert.equal(response?.failed, undefined);
  const payload = response?.succeeded?.response;
  assert.ok(payload);
  return defaultPayloadConverter.fromPayload(payload) as CanonicalObservation[];
}

function completionJob(stimulus: Stimulus) {
  return { doUpdate: {
    name: bpmnCompleteUserTaskUpdateName, id: stimulus.commandId, protocolInstanceId: stimulus.commandId,
    input: [defaultPayloadConverter.toPayload(stimulus)], runValidator: true,
  } };
}

function unrelatedIngress(definition: typeof program.identity) {
  const occurrence = initialTimer.id;
  const channel = { kind: MessageChannelKind.OperationMessage, interfaceId: "Messages", interfaceOperationId: "Receive", messageId: "Reminder" } as const;
  const message = { kind: StimulusKind.DeliverMessage, commandId: "b-message", subscriptionId: occurrence, channel } as const;
  const payload = { ...message, kind: StimulusKind.DeliverPayloadMessage, commandId: "c-payload", payload: { kind: VariableValueKind.String, value: "unsupported" } } as const;
  const correlated = {
    kind: StimulusKind.DeliverCorrelatedPayloadMessage, commandId: "a-correlated",
    address: { definition, processId: program.processId, channel, correlationKeyId: "key" },
    ingressOrdinal: 1, subscriptionId: occurrence, correlationPropertyId: "correlation", processPropertyId: "property",
    payload: payload.payload,
  } as const;
  const incidentId = { effectId: occurrence, generation: 1 } as const;
  const retry = { kind: StimulusKind.RetryIncident, commandId: "z-retry", incidentId } as const;
  const cancel = { kind: StimulusKind.CancelIncidentProcess, commandId: "a-cancel", incidentId, processInstanceId: start.instanceId } as const;
  const update = (name: string, stimulus: Stimulus) => ({ doUpdate: {
    name, id: stimulus.commandId, protocolInstanceId: stimulus.commandId,
    input: [defaultPayloadConverter.toPayload(stimulus)], runValidator: true,
  } });
  const signal = (stimulus: Stimulus) => ({ signalWorkflow: {
    signalName: bpmnDeliverMessageSignalName, input: [defaultPayloadConverter.toPayload(stimulus)],
  } });
  return {
    messages: [correlated, message, payload], incidents: [cancel, retry],
    jobs: [signal(message), signal(payload), update(bpmnDeliverCorrelatedMessageUpdateName, correlated),
      update(bpmnRetryEffectIncidentUpdateName, retry), update(bpmnCancelIncidentProcessUpdateName, cancel)],
  };
}
