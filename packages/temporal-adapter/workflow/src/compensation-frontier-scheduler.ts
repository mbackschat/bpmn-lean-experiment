/** Durable ownership and canonical result release for one committed Compensation frontier. */
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
  compareCanonicalStrings,
  projectCompensationEffectTransportMaterial,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  CompensationEffectTransportMaterial,
  CompensationHandlerEffectWait,
  EffectOccurrenceId,
  RuntimeState,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import {
  EffectActivityCapacityPreflightKind,
  compensationEffectTransportKey,
  preflightEffectActivityRequest,
} from "@bpmn-lean/temporal-protocol";
import type {
  EffectActivityCapacityBound,
  EffectActivityResult,
  EffectRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  ActivityFailure,
  CancellationScope,
  isCancellation,
} from "@temporalio/workflow";

import {
  ActivationDrain,
  createActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import type {
  ActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import {
  compensationEffectActivityResultCommand,
  throwEffectHostFailure,
} from "./effect-execution-host.js";
import {
  effectActivityExhaustionFailure,
  executeEffectWithinCapacity,
} from "./workflow-effect-capacity.js";
import { hostInvariantFailure } from "./host-invariant.js";

export type CompensationActivityCompletion = Readonly<{
  material: CompensationEffectTransportMaterial;
  result: unknown;
}>;

export type CompensationActivationReadiness =
  ActivationTaggedReadiness<CompensationActivityCompletion>;

export type CompensationActivityCallbacks = Readonly<{
  material: CompensationEffectTransportMaterial;
  onResult: (result: unknown) => void;
  onCancellation: () => void;
  onFailure: (error: unknown) => void;
}>;

export type CompensationActivityOwner = Readonly<{
  cancel: () => void;
}>;

export type CompensationFrontierSchedulerAdapters = Readonly<{
  preflightRequest: (request: EffectRequest) => void;
  startActivity: (
    request: EffectRequest,
    callbacks: CompensationActivityCallbacks,
  ) => CompensationActivityOwner;
  readiness: CompensationActivationReadiness;
}>;

export type CompensationFrontierScheduler = Readonly<{
  ownsCommittedFrontier: (state: RuntimeState) => boolean;
  waitForReadiness: (state: RuntimeState) => Promise<CompleteEffectStimulus>;
  reconcileCommittedState: (state: RuntimeState) => void;
  hasUnreconciledActivities: () => boolean;
  waitForIdle: () => Promise<void>;
}>;

/**
 * Creates the state machine independently of Temporal globals so ordering and drain probes can inject
 * only the two host mechanisms they observe.
 */
export function createCompensationFrontierScheduler(
  program: SemanticProcessProgram,
  adapters: CompensationFrontierSchedulerAdapters,
): CompensationFrontierScheduler {
  const owners = new Map<string, OwnedActivity>();
  let pendingCompletions: CompensationActivityCompletion[] = [];
  let terminalFailure: unknown;
  let idleWaiters: IdleWaiter[] = [];

  function fail(error: unknown): void {
    if (terminalFailure === undefined) {
      terminalFailure = error;
      adapters.readiness.recordFailure(error);
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const waiter of waiters) waiter.reject(error);
    }
  }

  function removeOwner(key: string, owner: OwnedActivity): void {
    if (owners.get(key) !== owner) return;
    owners.delete(key);
    if (owners.size === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const waiter of waiters) waiter.resolve();
    }
  }

  function resultCallback(
    key: string,
    owner: OwnedActivity,
    result: unknown,
  ): void {
    if (owners.get(key) !== owner) return;
    if (!owner.waitPresent) {
      removeOwner(key, owner);
      return;
    }
    if (owner.phase !== OwnedActivityPhase.Running) {
      fail(hostInvariantFailure(
        "Compensation Activity produced more than one terminal callback",
      ));
      return;
    }
    owner.phase = OwnedActivityPhase.ResultReady;
    adapters.readiness.record({ material: owner.material, result });
  }

  function cancellationCallback(key: string, owner: OwnedActivity): void {
    if (owners.get(key) !== owner) return;
    if (owner.waitPresent) {
      fail(hostInvariantFailure(
        "Compensation Activity cancelled while its committed semantic wait remained live",
      ));
      return;
    }
    removeOwner(key, owner);
  }

  function failureCallback(error: unknown): void {
    fail(error);
  }

  function scheduleFrontier(state: RuntimeState): void {
    const waits = state.compensationHandlerEffectWaits ?? [];
    if (waits.length === 0) return;
    requireOwnedState(program, state, waits);

    const newPlans: ActivityPlan[] = [];
    for (const wait of [...waits].sort(compareCompensationWaits)) {
      const material = projectCompensationEffectTransportMaterial(program, wait);
      const transportKey = compensationEffectTransportKey(material);
      const key = occurrenceKey(wait.id);
      const existing = owners.get(key);
      if (existing !== undefined) {
        if (existing.transportKey !== transportKey) {
          throw hostInvariantFailure(
            "Committed Compensation wait changed material behind one live occurrence identity",
          );
        }
        existing.waitPresent = true;
        continue;
      }
      newPlans.push({
        key,
        material,
        request: {
          ...material.descriptor,
          idempotencyKey: transportKey,
          arguments: material.arguments,
        },
        transportKey,
        wait,
      });
    }

    // The approved preflight requires the entire new maximal frontier to pass capacity before the
    // first Activity command exists; otherwise an early member could run beside a refused sibling.
    for (const plan of newPlans) adapters.preflightRequest(plan.request);
    for (const plan of newPlans) {
      const owner: OwnedActivity = {
        material: plan.material,
        transportKey: plan.transportKey,
        wait: plan.wait,
        waitPresent: true,
        phase: OwnedActivityPhase.Running,
        activity: undefined,
        cancellationRequested: false,
      };
      owners.set(plan.key, owner);
      try {
        owner.activity = adapters.startActivity(plan.request, {
          material: plan.material,
          onResult: (result) => resultCallback(plan.key, owner, result),
          onCancellation: () => cancellationCallback(plan.key, owner),
          onFailure: failureCallback,
        });
      } catch (error: unknown) {
        removeOwner(plan.key, owner);
        throw error;
      }
    }
  }

  function nextPendingCompletion(): CompensationActivityCompletion | undefined {
    while (pendingCompletions.length > 0) {
      const completion = pendingCompletions.shift();
      if (completion === undefined) return undefined;
      const owner = owners.get(occurrenceKey(completion.material.effectId));
      if (
        owner !== undefined &&
        owner.waitPresent &&
        owner.phase === OwnedActivityPhase.ResultReady &&
        owner.transportKey === compensationEffectTransportKey(completion.material)
      ) {
        return completion;
      }
    }
    return undefined;
  }

  async function waitForReadiness(
    state: RuntimeState,
  ): Promise<CompleteEffectStimulus> {
    if (terminalFailure !== undefined) throw terminalFailure;
    scheduleFrontier(state);
    for (;;) {
      const completion = nextPendingCompletion();
      if (completion !== undefined) {
        const owner = owners.get(occurrenceKey(completion.material.effectId));
        if (owner === undefined) continue;
        const command = compensationEffectActivityResultCommand(
          owner.wait,
          completion.result,
        );
        switch (command.kind) {
          case "command":
            owner.phase = OwnedActivityPhase.ResultReleased;
            return command.stimulus;
          case "failure":
            return throwEffectHostFailure(command.failure);
          default:
            return assertNever(command);
        }
      }
      const batch = await adapters.readiness.takeBatch();
      pendingCompletions = [
        ...pendingCompletions,
        ...batch.slice().sort(compareCompletions),
      ];
    }
  }

  function reconcileCommittedState(state: RuntimeState): void {
    const liveWaits = new Map(
      (state.compensationHandlerEffectWaits ?? []).map((wait) => [
        occurrenceKey(wait.id),
        wait,
      ]),
    );
    for (const [key, owner] of owners) {
      const live = liveWaits.get(key);
      if (live !== undefined) {
        const material = projectCompensationEffectTransportMaterial(program, live);
        if (owner.transportKey !== compensationEffectTransportKey(material)) {
          throw hostInvariantFailure(
            "Committed Compensation wait changed material behind one live occurrence identity",
          );
        }
        owner.waitPresent = true;
        continue;
      }

      owner.waitPresent = false;
      switch (owner.phase) {
        case OwnedActivityPhase.Running:
          if (!owner.cancellationRequested) {
            if (owner.activity === undefined) {
              throw hostInvariantFailure(
                "Compensation Activity lost its cancellation owner before reconciliation",
              );
            }
            owner.cancellationRequested = true;
            owner.phase = OwnedActivityPhase.CancellationDraining;
            owner.activity.cancel();
          }
          break;
        case OwnedActivityPhase.ResultReady:
        case OwnedActivityPhase.ResultReleased:
          removeOwner(key, owner);
          break;
        case OwnedActivityPhase.CancellationDraining:
          break;
        default:
          assertNever(owner.phase);
      }
    }
  }

  return {
    ownsCommittedFrontier: (state) =>
      (state.compensationHandlerEffectWaits?.length ?? 0) > 0,
    waitForReadiness,
    reconcileCommittedState,
    hasUnreconciledActivities: () => owners.size > 0,
    waitForIdle() {
      if (terminalFailure !== undefined) return Promise.reject(terminalFailure);
      if (owners.size === 0) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        idleWaiters.push({ resolve, reject });
      });
    },
  };
}

/** Composes the deterministic scheduler with Temporal's Activity and activation mechanisms. */
export function createTemporalCompensationFrontierScheduler(
  program: SemanticProcessProgram,
  executeEffect: (request: EffectRequest) => Promise<EffectActivityResult>,
  failCapacity: (failure: EffectActivityCapacityBound) => never,
): CompensationFrontierScheduler {
  const readiness = createActivationTaggedReadiness<CompensationActivityCompletion>(
    ActivationDrain.Required,
    "Compensation frontier scheduler woke without one classified Activity callback",
  );
  return createCompensationFrontierScheduler(program, {
    readiness,
    preflightRequest(request) {
      const preflight = preflightEffectActivityRequest(request);
      switch (preflight.kind) {
        case EffectActivityCapacityPreflightKind.WithinCapacity:
          return;
        case EffectActivityCapacityPreflightKind.CapacityExceeded:
          return failCapacity(preflight.failure);
        default:
          return assertNever(preflight);
      }
    },
    startActivity(request, callbacks) {
      const scope = new CancellationScope({ cancellable: true });
      void scope.run(() =>
        executeEffectWithinCapacity(request, executeEffect, failCapacity)
      ).then(
        callbacks.onResult,
        (error: unknown) => {
          if (isCancellation(error)) {
            callbacks.onCancellation();
            return;
          }
          callbacks.onFailure(
            error instanceof ActivityFailure
              ? effectActivityExhaustionFailure(error)
              : error,
          );
        },
      );
      return { cancel: () => scope.cancel() };
    },
  });
}

function requireOwnedState(
  program: SemanticProcessProgram,
  state: RuntimeState,
  waits: ReadonlyArray<CompensationHandlerEffectWait>,
): void {
  const activeTriggers = (state.compensationTriggers ?? []).filter(
    ({ lifecycle }) => lifecycle === "active",
  );
  const activeTrigger = activeTriggers[0];
  const activeHandlers = activeTrigger?.handlers.filter(
    (handler) => handler.lifecycle === "compensating",
  ) ?? [];
  if (program.identity.semanticProfile !== COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID) {
    throw hostInvariantFailure(
      "Compensation frontier reached hosting outside its exact checkpoint profile",
    );
  }
  const first = waits[0];
  if (
    first === undefined ||
    waits.some(({ triggerId }) => !sameOccurrence(triggerId, first.triggerId)) ||
    activeTriggers.length !== 1 ||
    activeTrigger === undefined ||
    !sameOccurrence(activeTrigger.id, first.triggerId) ||
    activeHandlers.length !== waits.length ||
    waits.some((wait) => !activeHandlers.some((handler) =>
      sameOccurrence(handler.id, wait.handlerId) &&
      handler.lifecycle === "compensating" &&
      sameOccurrence(handler.effectId, wait.id)
    )) ||
    state.timerWaits.length > 0 ||
    state.effectWaits.length > 0 ||
    state.messageWaits.length > 0 ||
    state.userTaskWaits.length > 0 ||
    state.effectIncidents.length > 0 ||
    state.eventRaces.length > 0
  ) {
    throw hostInvariantFailure(
      "Compensation frontier does not exclusively own one trigger's committed waits",
    );
  }
}

function compareCompensationWaits(
  left: CompensationHandlerEffectWait,
  right: CompensationHandlerEffectWait,
): number {
  return compareOccurrences(left.id, right.id);
}

function compareCompletions(
  left: CompensationActivityCompletion,
  right: CompensationActivityCompletion,
): number {
  return compareOccurrences(left.material.effectId, right.material.effectId);
}

function compareOccurrences(
  left: EffectOccurrenceId,
  right: EffectOccurrenceId,
): number {
  return compareCanonicalStrings(left.processInstanceId, right.processInstanceId) ||
    compareCanonicalStrings(left.elementId, right.elementId) ||
    left.activation - right.activation;
}

function sameOccurrence(
  left: EffectOccurrenceId,
  right: EffectOccurrenceId,
): boolean {
  return compareOccurrences(left, right) === 0;
}

function occurrenceKey(id: EffectOccurrenceId): string {
  return JSON.stringify([id.processInstanceId, id.elementId, id.activation]);
}

enum OwnedActivityPhase {
  Running = "running",
  ResultReady = "resultReady",
  ResultReleased = "resultReleased",
  CancellationDraining = "cancellationDraining",
}

type OwnedActivity = {
  material: CompensationEffectTransportMaterial;
  transportKey: string;
  wait: CompensationHandlerEffectWait;
  waitPresent: boolean;
  phase: OwnedActivityPhase;
  activity: CompensationActivityOwner | undefined;
  cancellationRequested: boolean;
};

type ActivityPlan = Readonly<{
  key: string;
  material: CompensationEffectTransportMaterial;
  request: EffectRequest;
  transportKey: string;
  wait: CompensationHandlerEffectWait;
}>;

type IdleWaiter = Readonly<{
  resolve: () => void;
  reject: (error: unknown) => void;
}>;

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Compensation scheduler variant: ${String(value)}`);
}
