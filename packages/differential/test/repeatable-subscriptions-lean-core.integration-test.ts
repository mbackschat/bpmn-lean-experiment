import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, MessageChannelKind, ObservationRequestKind, ScenarioDocumentKind, StimulusKind,
  applyStimulusWithTrace, initialState, isWellFormedRuntimeState, projectOpenFlowNodeOccurrences,
  replayCommittedTransitions, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, Stimulus } from "@bpmn-lean/semantic-core";
import { runLeanInterpreter } from "./semantic-differential-targets.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";

const instanceId = "SubscriptionInstance";
const profile = "bpmn-2.0.2-repeatable-event-subscriptions-draft";
const occurrence = (elementId: string, activation = 1) => ({ processInstanceId: instanceId, elementId, activation });
const complete = (elementId: string, activation = 1): Stimulus => ({
  kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`,
  taskId: occurrence(elementId, activation), submittedValues: [],
});
const reminder = (name: string, count: number, stale = false): Stimulus =>
  name === "boundary-message" || name === "message-host-with-child-entry"
  ? { kind: StimulusKind.DeliverMessage, commandId: `${stale ? "stale" : "trigger"}-${count}`,
    subscriptionId: occurrence("Reminder"), channel: { kind: MessageChannelKind.OperationMessage,
      interfaceId: "ApplicationMessages", interfaceOperationId: "ReceiveReminder", messageId: "ApplicationReminder" } }
  : { kind: StimulusKind.FireTimer, commandId: `${stale ? "stale" : "trigger"}-${count}`,
    timerId: occurrence("Reminder", count), logicalTimeMs: count * 1_000 };

const observations = [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
  ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
  ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
  ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime];

test("source-bound subscriptions agree through command closure, lifetime races, cancellation, and E1/E2 publication", async () => {
  const inputs = [];
  for (const name of ["boundary-message", "boundary-timer", "catch-message", "catch-timer",
    "receive-task", "subprocess-boundary-timer", "burst-8", "message-host-with-child-entry"]) {
    const original = await readFile(new URL(`../../bpmn-source/test/fixtures/repeatable-event-subscriptions/${name}.bpmn`, import.meta.url), "utf8");
    const modes = name === "message-host-with-child-entry" ? ["repeat", "interrupting"] :
      name === "boundary-timer" || name === "subprocess-boundary-timer" ? ["repeat", "one-shot"] : ["repeat"];
    for (const mode of modes) {
      const bytes = mode === "one-shot" ? original.replace("<bpmn:timeCycle>R/PT1S</bpmn:timeCycle>",
        "<bpmn:timeDuration>PT1S</bpmn:timeDuration>") : mode === "interrupting"
        ? original.replace('cancelActivity="false"', 'cancelActivity="true"') : original;
      const compiled = await compileBpmnToSemanticProcess({ bytes: new TextEncoder().encode(bytes),
        sourceId: `${name}-${mode}`, expectedSha256: undefined, sourceOverlay: null, semanticProfile: profile,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 } });
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("source rejected");
      const program = compiled.semanticProcess;
      const start: Stimulus = { kind: StimulusKind.StartProcess, commandId: "start-subscription",
        processId: program.processId, instanceId, initialVariables: [] };
      const schedules: Array<{ label: string; stimuli: Stimulus[]; terminal: boolean }> = [];
      if (mode !== "one-shot") schedules.push({ label: "start", stimuli: [start], terminal: false });
      if (name === "message-host-with-child-entry") {
        const stimuli: Stimulus[] = [start, reminder(name, 1), complete("UserTask_Trigger")];
        if (mode === "repeat") stimuli.push(reminder(name, 2), complete("IndependentAudit"));
        stimuli.push(reminder(name, 1, true));
        if (mode === "repeat") stimuli.push(complete("HandleReminder", 2));
        stimuli.push(complete("HandleReminder", 1), complete("UserTask_Outer"));
        schedules.push({ label: "child-cancellation-and-handler-completion", stimuli, terminal: true });
      }
      if (name === "boundary-message" || name === "boundary-timer" || name === "subprocess-boundary-timer") {
        const childHost = name === "subprocess-boundary-timer";
        for (const fires of [0, mode === "repeat" ? 2 : 1]) {
          const stimuli: Stimulus[] = [start];
          for (let count = 1; count <= fires; count += 1) stimuli.push(reminder(name, count));
          stimuli.push(complete(childHost ? "UserTask_Trigger" : "UserTask_Sibling"), reminder(name, 1, true));
          if (childHost) {
            for (let count = 1; count <= fires; count += 1) stimuli.push(complete("HandleReminder", count));
          } else stimuli.push(complete("UserTask_Trigger"));
          stimuli.push(complete("UserTask_Outer"), complete("IndependentAudit"));
          schedules.push({ label: `fires-${fires}`, stimuli, terminal: true });
        }
      }
      if (name === "catch-message" || name === "catch-timer" || name === "receive-task") {
        const catchInput: Stimulus = name === "catch-timer"
          ? { kind: StimulusKind.FireTimer, commandId: "resume-catch", timerId: occurrence("UserTask_Sibling"), logicalTimeMs: 1_000 }
          : { kind: StimulusKind.DeliverMessage, commandId: "resume-catch", subscriptionId: occurrence("UserTask_Sibling"),
            channel: name === "receive-task"
              ? { kind: MessageChannelKind.DirectMessage, messageId: "ApplicationReminder" }
              : { kind: MessageChannelKind.OperationMessage, interfaceId: "ApplicationMessages",
                interfaceOperationId: "ReceiveReminder", messageId: "ApplicationReminder" } };
        for (const resumeFirst of [false, true]) {
          const stimuli: Stimulus[] = [start];
          if (resumeFirst) stimuli.push(catchInput);
          stimuli.push(complete("UserTask_Trigger"), { ...catchInput, commandId: "stale-catch" },
            complete("UserTask_Outer"), complete("IndependentAudit"));
          schedules.push({ label: resumeFirst ? "catch-before-cancel" : "cancel-before-catch", stimuli, terminal: true });
        }
      }
      for (const schedule of schedules) {
        const scenario: Scenario = { kind: ScenarioDocumentKind.Scenario, id: `${name}-${mode}-${schedule.label}`,
          profile, bpmn: { id: program.identity.sourceId, sha256: program.identity.sourceSha256,
            sourceOverlay: null, relativePath: `${name}-${mode}.bpmn` }, stimuli: schedule.stimuli, observations,
          // ESL-ORDER is a project-selected normative account, with no CIB execution oracle selected.
          provenance: { normativeRefs: ["BPMN 2.0.2 Clause 13.5.2", "BPMN 2.0.2 Clause 13.5.3"],
            cibRevision: "not-applicable", cibRefs: [] } };
        inputs.push({ scenario, program, bytes, checkedProcess: compiled.checkedProcess, terminal: schedule.terminal });
      }
    }
  }
  assert.equal(inputs.length, 27);
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-subscription-pipeline-"));
  try {
    const sources = new Map(inputs.map(({ scenario, bytes }) => [scenario.bpmn.relativePath, bytes]));
    await Promise.all([...sources].map(([relativePath, bytes]) => writeFile(path.join(directory, relativePath), bytes)));
    const definitions = path.join(directory, "definitions.jsonl");
    await writeFile(definitions, inputs.map(({ scenario, program, checkedProcess }) =>
      JSON.stringify({ scenarioId: scenario.id, checkedProcess, semanticProcess: program })).join("\n") + "\n");
    const paths = await Promise.all(inputs.map(async ({ scenario }) => {
      const file = path.join(directory, `${scenario.id}.json`);
      await writeFile(file, JSON.stringify(scenario));
      return file;
    }));
    const execution = await runLeanInterpreter("BpmnSemantics/SemanticProcessJsonMain.lean",
      ["--publications", definitions, ...paths], inputs.length);
    const actual = execution.stdout.trim().split("\n").map((line) =>
      parseStrictJson<{ scenarioId: string; scenario: Scenario; result: unknown; commandPublications: unknown }>(line, "subscription Lean result"));
    assert.equal(actual.length, inputs.length);
    for (const [index, { scenario, program, terminal }] of inputs.entries()) {
      assert.deepEqual(actual[index]?.scenario, scenario);
      assert.deepEqual(actual[index]?.result, runScenario(scenario, program), scenario.id);
      let state = initialState;
      const publications = scenario.stimuli.map((stimulus) => {
        const before = state;
        const traced = applyStimulusWithTrace(program, before, stimulus);
        state = traced.result.state;
        assert.equal(traced.result.outcome, stimulus.commandId.startsWith("stale") ? CommandOutcome.Rejected : CommandOutcome.Committed);
        assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
        assert.equal(traced.committedTransitions.length > 0, traced.result.outcome === CommandOutcome.Committed);
        assert.equal(traced.flowNodeOccurrenceLifecycles.length, traced.committedTransitions.length);
        assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
        const replayed = replayCommittedTransitions(program, before, traced.committedTransitions);
        assert.deepEqual(replayed, traced.result.outcome === CommandOutcome.Committed ? state : null,
          `${scenario.id}/${stimulus.commandId} replay`);
        const traceReplays = isDeepStrictEqual(replayed, state);
        if (traced.result.outcome === CommandOutcome.Rejected) assert.deepEqual(state, before);
        return { commandId: stimulus.commandId, outcome: traced.result.outcome,
          stateUnchanged: isDeepStrictEqual(state, before), stateWellFormed: isWellFormedRuntimeState(program, instanceId, state),
          traceReplays,
          publication: traced.committedTransitions.length === 0 ? null :
            { transitions: traced.committedTransitions, current: traced.currentPositions },
          lifecycles: traced.flowNodeOccurrenceLifecycles, openOccurrences: projectOpenFlowNodeOccurrences(program, state) };
      });
      if (terminal) assert.equal(state.control.kind, "completed");
      assert.deepEqual(actual[index]?.commandPublications, publications, `${scenario.id} publications`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
