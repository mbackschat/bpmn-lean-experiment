import {
  SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
  projectEffectTransportMaterial,
  projectOpenEffects,
} from "@bpmn-lean/semantic-core";
import type { CompleteEffectStimulus, RuntimeState, SemanticProcessProgram, Stimulus } from "@bpmn-lean/semantic-core";
import {
  EffectActivityCapacityPreflightKind,
  effectTransportKey,
  preflightEffectActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import type { EffectActivityResult, EffectRequest } from "@bpmn-lean/temporal-protocol";
import { ActivityFailure, CancelledFailure, condition, workflowInfo } from "@temporalio/workflow";
import type { WorkflowChainObservedCapacityBound } from "./workflow-chain-capacity.js";
import type { WorkflowChainEventHistoryLimits } from "./workflow-event-history-capacity.js";
import { assessOrdinaryEffectHistoryReservation, OrdinaryEffectHistoryReservationKind } from "./ordinary-effect-history-reservation.js";
import { legacyEffectActivityPolicy } from "./effect-activity-policy.js";
import { effectActivityResultCommand, throwEffectHostFailure } from "./effect-execution-host.js";
import { hostInvariantFailure } from "./host-invariant.js";
import { effectActivityExhaustionFailure, executeEffectWithinCapacity } from "./workflow-effect-capacity.js";

export type EffectFrontierScheduler = Readonly<{
  ownsCommittedFrontier: (state: RuntimeState) => boolean;
  waitForReadiness: (state: RuntimeState, hostWakeRequested: () => boolean) => Promise<CompleteEffectStimulus | undefined>;
  reconcileCommittedState: (state: RuntimeState) => void;
  hasUnreconciledActivities: () => boolean;
  waitForIdle: () => Promise<void>;
}>;

type Adapters = Readonly<{
  newActivitiesFenced: () => boolean;
  reserveHistory: (issuedActivities: number, requestBytes: ReadonlyArray<number>) => boolean;
  executeEffect: (request: EffectRequest) => Promise<EffectActivityResult>;
  failCapacity: (failure: WorkflowChainObservedCapacityBound) => never;
  enqueueCompletion: (completion: Stimulus) => void;
  waitUntil: (predicate: () => boolean) => Promise<void>;
}>;

enum ActivityPhase {
  Running = "running",
  Released = "released",
}
type Owner = { transportKey: string; phase: ActivityPhase };

/** Owns ordinary MI effects until their callback command commits; no cancellation is admitted. */
export function createOrdinaryEffectFrontierScheduler(
  program: SemanticProcessProgram,
  adapters: Adapters,
): EffectFrontierScheduler {
  if (program.identity.semanticProfile !== SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID) {
    throw hostInvariantFailure("Ordinary effect frontier requires the private sequential MI profile");
  }
  const owners = new Map<string, Owner>();
  let failure: { error: unknown } | undefined;
  const occurrenceKey = (effect: ReturnType<typeof projectOpenEffects>[number]) =>
    JSON.stringify([effect.id.processInstanceId, effect.id.elementId, effect.id.activation]);
  function checkFailure(): void {
    if (failure !== undefined) throw failure.error;
  }
  function fail(error: unknown): void {
    failure ??= { error };
  }
  function schedule(state: RuntimeState): void {
    checkFailure();
    // workflowRolloverPermitted requires issued Activities to settle; extending their frontier prevents that drain.
    if (adapters.newActivitiesFenced()) return;
    const plans = projectOpenEffects(state).map(effect => {
      const material = projectEffectTransportMaterial(program, effect);
      const transportKey = effectTransportKey(material);
      const key = occurrenceKey(effect);
      const owner = owners.get(key);
      if (owner !== undefined && owner.transportKey !== transportKey) {
        throw hostInvariantFailure("Committed effect changed material behind one live occurrence identity");
      }
      return { effect, key, transportKey, owner, request: {
        ...material.descriptor, idempotencyKey: transportKey, arguments: material.arguments,
      } };
    }).filter(plan => plan.owner === undefined);
    // SMIS hosting preflight: refuse the whole new frontier before issuing any external effect.
    const requestBytes: number[] = [];
    for (const plan of plans) {
      const preflight = preflightEffectActivityRequest(plan.request);
      if (preflight.kind === EffectActivityCapacityPreflightKind.CapacityExceeded) {
        adapters.failCapacity(preflight.failure);
      } else requestBytes.push(preflight.observedValue);
    }
    if (!adapters.reserveHistory(owners.size, requestBytes)) return;
    for (const plan of plans) {
      const owner: Owner = { transportKey: plan.transportKey, phase: ActivityPhase.Running };
      owners.set(plan.key, owner);
      void executeEffectWithinCapacity(plan.request, adapters.executeEffect, adapters.failCapacity)
        .then(result => {
          const command = effectActivityResultCommand(legacyEffectActivityPolicy, state, plan.effect, result);
          switch (command.kind) {
            case "command":
              // SMIS explicit schedules: callback arrival shares the ingress queue with human commands.
              adapters.enqueueCompletion(command.stimulus);
              owner.phase = ActivityPhase.Released;
              return;
            case "failure":
              throwEffectHostFailure(command.failure);
          }
        }).catch((error: unknown) => fail(
          error instanceof ActivityFailure && !(error.cause instanceof CancelledFailure)
            ? effectActivityExhaustionFailure(error) : error,
        ));
    }
  }
  return {
    ownsCommittedFrontier: state => state.effectWaits.length > 0 || owners.size > 0 || failure !== undefined,
    async waitForReadiness(state, hostWakeRequested) {
      schedule(state);
      await adapters.waitUntil(() => failure !== undefined || hostWakeRequested() ||
        [...owners.values()].some(owner => owner.phase === ActivityPhase.Released));
      checkFailure();
      return undefined;
    },
    reconcileCommittedState(state) {
      checkFailure();
      const live = new Map(projectOpenEffects(state).map(effect => [occurrenceKey(effect), effect]));
      for (const [key, owner] of owners) {
        const effect = live.get(key);
        if (effect !== undefined) {
          if (effectTransportKey(projectEffectTransportMaterial(program, effect)) !== owner.transportKey) {
            throw hostInvariantFailure("Committed effect changed material behind one live occurrence identity");
          }
        } else {
          if (owner.phase === ActivityPhase.Running) {
            throw hostInvariantFailure("Ordinary MI effect disappeared before its Activity result was released");
          }
          owners.delete(key);
        }
      }
    },
    hasUnreconciledActivities: () => owners.size > 0,
    async waitForIdle() {
      await adapters.waitUntil(() => failure !== undefined || owners.size === 0);
      checkFailure();
    },
  };
}

export function createTemporalOrdinaryEffectFrontierScheduler(
  program: SemanticProcessProgram,
  executeEffect: Adapters["executeEffect"],
  failCapacity: Adapters["failCapacity"],
  enqueueCompletion: Adapters["enqueueCompletion"],
  newActivitiesFenced: Adapters["newActivitiesFenced"],
  history: Readonly<{ limits: WorkflowChainEventHistoryLimits | null; hasRetainedWork: () => boolean; requestRollover: () => void }>,
): EffectFrontierScheduler {
  return createOrdinaryEffectFrontierScheduler(program, {
    executeEffect, failCapacity, enqueueCompletion, newActivitiesFenced, waitUntil: condition,
    reserveHistory(issuedActivities, requestBytes) {
      if (history.limits === null) return true;
      const reservation = assessOrdinaryEffectHistoryReservation({ limits: history.limits, history: workflowInfo(),
        issuedActivities, requestBytes, hasRetainedWork: history.hasRetainedWork() });
      switch (reservation.kind) {
        case OrdinaryEffectHistoryReservationKind.Ready: return true;
        case OrdinaryEffectHistoryReservationKind.Rollover: history.requestRollover(); return false;
        case OrdinaryEffectHistoryReservationKind.CapacityExceeded: return failCapacity(reservation.failure);
      }
    },
  });
}
