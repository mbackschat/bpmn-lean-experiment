import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { Context } from "@temporalio/activity";
import {
  CommandOutcome, ControlStateKind, StimulusKind, applyStimulus, initialState,
  projectCompensationEffectTransportMaterial,
} from "@bpmn-lean/semantic-core";
import type { CompleteEffectStimulus, Scenario, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { completeEffectCommandId, compensationEffectTransportKey } from "@bpmn-lean/temporal-protocol";
import type { EffectRequest } from "@bpmn-lean/temporal-protocol";
import type { TemporalHistory, TemporalScenarioExecution } from "./contracts.js";
import { EffectProbeActivityRegistry } from "./effect-probe.js";
import { requireDurableEffectActivityHistory } from "./harness-evidence.js";
import {
  asArray, asRecord, decodeJsonPayload, historyEvents, integerToBigInt,
} from "./history-evidence-decoding.js";

type EffectEntry = {
  request: EffectRequest;
  activationCommandId: string;
  completion?: CompleteEffectStimulus;
  started: boolean;
  released: boolean;
};

/** Drives neutral Compensation results through real Activities, including cancelled frontier members. */
export class OrderedEffectExecution {
  private readonly entries = new Map<string, EffectEntry>();
  private readonly frontiers = new Map<string, readonly EffectEntry[]>();
  private stopped = false;

  constructor(scenario: Scenario, program: SemanticProcessProgram) {
    let state = initialState;
    for (const stimulus of scenario.stimuli) {
      if (stimulus.kind === StimulusKind.CompleteEffect) {
        const entry = this.entries.get(JSON.stringify(stimulus.effectId));
        if (entry === undefined || entry.completion !== undefined ||
          stimulus.commandId !== completeEffectCommandId(stimulus.effectId, stimulus.result)) {
          throw new TypeError("Ordered effect completion is not content-bound to one committed intent");
        }
        entry.completion = stimulus;
        this.frontiers.set(stimulus.commandId, (state.compensationHandlerEffectWaits ?? []).map(({ id }) => {
          const member = this.entries.get(JSON.stringify(id));
          if (member === undefined) throw new TypeError("Ordered effect frontier lost its committed intent");
          return member;
        }));
      }
      const step = applyStimulus(program, state, stimulus);
      if (step.outcome !== CommandOutcome.Committed && step.outcome !== CommandOutcome.Rejected) {
        throw new TypeError(`Ordered effect prefix is not executable: ${stimulus.commandId}`);
      }
      state = step.state;
      for (const wait of state.compensationHandlerEffectWaits ?? []) {
        const material = projectCompensationEffectTransportMaterial(program, wait);
        const request = {
          ...material.descriptor, arguments: material.arguments,
          idempotencyKey: compensationEffectTransportKey(material),
        };
        const key = JSON.stringify(wait.id);
        const prior = this.entries.get(key);
        if (prior === undefined) {
          this.entries.set(key, { request, activationCommandId: stimulus.commandId, started: false, released: false });
        } else {
          assert.deepEqual(prior.request, request, "A retained effect intent changed before completion");
        }
      }
    }
    if (this.entries.size === 0 ||
      (state.control.kind !== ControlStateKind.Completed && state.control.kind !== ControlStateKind.Failed)) {
      throw new TypeError("Ordered Compensation input must reach a terminal Process");
    }
  }

  async run(
    registry: EffectProbeActivityRegistry,
    execute: (release: (stimulus: CompleteEffectStimulus) => Promise<void>) => Promise<TemporalScenarioExecution>,
  ): Promise<TemporalScenarioExecution> {
    const registrations: string[] = [];
    try {
      for (const entry of this.entries.values()) {
        registry.register(entry.request, async () => {
          entry.started = true;
          const context = Context.current();
          while (!entry.released) {
            if (this.stopped) throw new Error("Ordered Activity harness stopped");
            context.heartbeat();
            await context.sleep(25);
          }
          if (entry.completion === undefined) throw new Error("Cancelled handler has no completion input");
          return entry.completion.result;
        });
        registrations.push(entry.request.idempotencyKey);
      }
      const execution = await execute((stimulus) => this.release(stimulus));
      this.requireHistory(execution.history);
      return execution;
    } finally {
      this.stopped = true;
      for (const key of registrations) registry.unregister(key);
    }
  }

  private async release(stimulus: CompleteEffectStimulus): Promise<void> {
    const entry = this.entries.get(JSON.stringify(stimulus.effectId));
    const frontier = this.frontiers.get(stimulus.commandId);
    if (entry === undefined || frontier === undefined || !isDeepStrictEqual(entry.completion, stimulus)) {
      throw new TypeError("Ordered Activity release differs from the neutral completion input");
    }
    const deadline = Date.now() + 5_000;
    while (frontier.some((member) => !member.started)) {
      if (Date.now() >= deadline) throw new Error("Compensation frontier Activities did not all start");
      await delay(10);
    }
    entry.released = true;
  }

  requireHistory(history: TemporalHistory): void {
    const scheduled = historyEvents(history, "activityTaskScheduledEventAttributes");
    assert.equal(scheduled.length, this.entries.size, "Every reached intent must schedule exactly one real Activity");
    const completedByCommand = new Map<string, bigint>();
    const scheduledByEntry = new Map<EffectEntry, bigint>();
    const workflowCompleted = historyEvents(history, "workflowExecutionCompletedEventAttributes");
    assert.equal(workflowCompleted.length, 1);
    const terminalId = integerToBigInt(workflowCompleted[0]!.event.eventId);
    for (const entry of this.entries.values()) {
      const matches = scheduled.filter(({ attributes }) => {
        const payloads = asArray(asRecord(attributes.input, "Activity input").payloads, "Activity payloads");
        return payloads.length === 1 && isDeepStrictEqual(decodeJsonPayload(payloads[0], "Activity request"), entry.request);
      });
      assert.equal(matches.length, 1, "Activity request must match exact committed content");
      const scheduledId = integerToBigInt(matches[0]!.event.eventId);
      scheduledByEntry.set(entry, scheduledId);
      const related = (field: string) => historyEvents(history, field).filter(({ attributes }) =>
        integerToBigInt(attributes.scheduledEventId) === scheduledId);
      const started = related("activityTaskStartedEventAttributes");
      assert.equal(started.length, 1);
      assert.equal(related("activityTaskFailedEventAttributes").length, 0);
      assert.equal(related("activityTaskTimedOutEventAttributes").length, 0);
      const completed = related("activityTaskCompletedEventAttributes");
      const requested = related("activityTaskCancelRequestedEventAttributes");
      const cancelled = related("activityTaskCanceledEventAttributes");
      if (entry.completion !== undefined) {
        assert.equal(requested.length, 0);
        assert.equal(cancelled.length, 0);
        assert.equal(completed.length, 1);
        requireDurableEffectActivityHistory({ events: [matches[0]!.event, started[0]!.event, completed[0]!.event] },
          entry.request, 1, entry.completion.result, { heartbeatTimeoutMs: 1_000 });
        completedByCommand.set(entry.completion.commandId, integerToBigInt(completed[0]!.event.eventId));
      } else {
        assert.equal(completed.length, 0);
        assert.equal(requested.length, 1);
        assert.equal(cancelled.length, 1);
        assert.ok(integerToBigInt(requested[0]!.event.eventId) < integerToBigInt(cancelled[0]!.event.eventId));
        assert.ok(integerToBigInt(cancelled[0]!.event.eventId) < terminalId, "Sibling cancellation must settle before terminal publication");
      }
    }
    for (const entry of this.entries.values()) {
      const predecessor = completedByCommand.get(entry.activationCommandId);
      if (predecessor !== undefined) {
        assert.ok(predecessor < scheduledByEntry.get(entry)!, "A dependent handler started before its predecessor completed");
      }
    }
    for (const [commandId, frontier] of this.frontiers) {
      const completion = completedByCommand.get(commandId);
      assert.ok(completion !== undefined);
      for (const entry of frontier) {
        // Temporal persists ActivityTaskStarted with the terminal Activity event;
        // https://docs.temporal.io/references/events#activitytaskstarted. The live
        // callback barrier proves actual starts; history independently binds scheduling.
        assert.ok(scheduledByEntry.get(entry)! < completion, "Every maximal handler must be scheduled before releasing a frontier result");
      }
    }
  }
}

/** Checks Activity requests, result content, dependency order and cancellation drain against neutral inputs. */
export function requireOrderedCompensationHistory(
  history: TemporalHistory,
  scenario: Scenario,
  program: SemanticProcessProgram,
): void {
  new OrderedEffectExecution(scenario, program).requireHistory(history);
}
