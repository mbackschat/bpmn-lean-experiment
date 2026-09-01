import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type {
  MessageSubscriptionId,
  OccurrenceId,
  TimerOccurrenceId,
} from "./contract.js";
import {
  ActivityBodyKind,
  ActivityHandlerKind,
  attachedTimerOccurrences,
  compareActivityOccurrences,
  sameActivityOccurrence,
  type ActivityBody,
  type ActivityOccurrence,
} from "./activity-occurrence.js";
import {
  compareCalledProcessOccurrences,
  compareEffectWaits,
  compareEventRaces,
  compareMessageWaits,
  compareSelectedBranchSets,
  compareTimerWaits,
  compareUserTaskWaits,
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";
import {
  compareSequentialMultiInstanceControllers,
} from "./sequential-multi-instance-controller.js";
import type { SequentialMultiInstanceController } from "./sequential-multi-instance-controller.js";
import {
  compareParallelMultiInstanceControllers,
} from "./parallel-multi-instance-controller.js";
import {
  parallelMultiInstanceStateDefectCodes,
} from "./parallel-multi-instance-state-validation.js";
import {
  RuntimeStateDefect,
} from "./runtime-state-defect.js";
export { RuntimeStateDefect };
import { sequentialMultiInstanceBindingsForState } from "./sequential-multi-instance-binding.js";
import { compareCanonicalStrings } from "./wire.js";
import { runtimeStateIdentityBound } from "./runtime-state-identity-bound.js";
import { compareActivityVariableScopes } from "./runtime-state-collection-ordering.js";
import {
  compensationRetentionStateDefects,
} from "./compensation-activity-retention-state-validation.js";
import {
  CompensationRetentionStateDefect,
} from "./compensation-activity-retention-contract.js";

/**
 * Which committed runtime states this account admits, and how a successor may contradict its
 * predecessor.
 *
 * This owner is separate from the state module because it needs `SemanticOperationKind` as a value:
 * deciding that a wait is declared means matching operation kinds, and the state module takes the
 * program contract as types only. Keeping that dependency here leaves the state representation
 * importable without pulling in the program.
 *
 * It is written over this package's own representation, in which each wait carries a composite
 * occurrence identity and the collections are compared by exported comparators. It is deliberately
 * not a transcription of the Lean predicate's decomposition; the two agreeing is a transcription
 * check carried by the publication-parity channel, and cannot establish that the account is right.
 */
/**
 * The classes of malformed committed state this account refuses.
 *
 * A defect names a failing class, not a rule identifier: no value here reaches a public command
 * result, and `admit` returns its ordinary refusal outcome rather than a diagnosis. The names exist
 * so a fixture can assert *which* class rejected a state instead of only that something did.
 */
/** The ways a successor may contradict its predecessor. Separate from {@link RuntimeStateDefect}
 * because neither can be decided from one state: a rewound counter is a property of the pair. */
export const RuntimeStateRegression = {
  ActivationCounter: "activationCounter",
  ActivityOccurrenceIssue: "activityOccurrenceIssue",
  EndOccurrences: "endOccurrences",
} as const;

export type RuntimeStateRegression =
  (typeof RuntimeStateRegression)[keyof typeof RuntimeStateRegression];

/**
 * Whether any two distinct positions share an occurrence key.
 *
 * Written as a scan over the collection's own equality rather than over an encoded key, because no
 * separator is reserved in the shared wire domain and the composite-identity encoder that owns that
 * problem belongs to the host adapter, which this package must not import. Wait collections hold a
 * handful of live entries, so the quadratic scan is not a cost worth an encoding for.
 */
function sharesAnOccurrenceKey(
  waits: ReadonlyArray<{ readonly id: OccurrenceId }>,
): boolean {
  return waits.some((wait, index) =>
    waits.some((other, otherIndex) => index !== otherIndex && sameOccurrence(wait.id, other.id)),
  );
}

/**
 * Element identities each operation kind may arm a wait for, by family.
 *
 * A composite arming operation declares waits of a family it is not named after: an Event-Based
 * Gateway race arms both a Message and a Timer wait under one operation, and the bounded and
 * monitored task families arm a deadline alongside their task. Matching on the family's own
 * operation kind alone would reject states four shipped profiles reach.
 */
function declaredElementIds(
  program: SemanticProcessProgram,
): Readonly<Record<"userTask" | "message" | "timer" | "effect", ReadonlySet<string>>> {
  const userTask = new Set<string>();
  const message = new Set<string>();
  const timer = new Set<string>();
  const effect = new Set<string>();
  for (const operation of program.operations) {
    switch (operation.kind) {
      case SemanticOperationKind.AwaitUserTask:
      // Both direct data families arm an ordinary task wait; their own Activity record owns local
      // data rather than a deadline, so neither declares a Timer element.
      case SemanticOperationKind.AwaitDataInputUserTask:
      case SemanticOperationKind.AwaitDataOutputUserTask:
        userTask.add(operation.task.elementId);
        break;
      case SemanticOperationKind.AwaitBoundedUserTask:
      case SemanticOperationKind.AwaitMonitoredUserTask:
      // The sequential Multi-Instance operation declares the same two families, and declares the task
      // family for *every* iteration: each generated inner instance reuses this one element ID with
      // its own activation, so one declaration covers the whole repetition.
      case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask:
      case SemanticOperationKind.AwaitParallelMultiInstanceUserTask:
        userTask.add(operation.task.elementId);
        timer.add(operation.boundaryTimer.elementId);
        break;
      case SemanticOperationKind.AwaitMessageBoundedUserTask:
        userTask.add(operation.task.elementId);
        message.add(operation.boundaryMessage.elementId);
        break;
      case SemanticOperationKind.EnterBoundedScope:
        timer.add(operation.boundaryTimer.elementId);
        break;
      case SemanticOperationKind.AwaitTimer:
        timer.add(operation.timer.elementId);
        break;
      case SemanticOperationKind.AwaitMessage:
      case SemanticOperationKind.AwaitPayloadMessage:
      case SemanticOperationKind.AwaitCorrelatedPayloadMessage:
        message.add(operation.message.elementId);
        break;
      case SemanticOperationKind.AwaitEventRace:
        message.add(operation.message.elementId);
        timer.add(operation.timer.elementId);
        break;
      case SemanticOperationKind.AwaitEffect:
        effect.add(operation.origin.elementId);
        break;
      case SemanticOperationKind.Initiate:
      case SemanticOperationKind.InitiateMessage:
      case SemanticOperationKind.InitiateTimer:
      case SemanticOperationKind.EnterScope:
      case SemanticOperationKind.InvokeProcess:
      case SemanticOperationKind.ReturnProcess:
      case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      case SemanticOperationKind.Duplicate:
      case SemanticOperationKind.Synchronize:
      case SemanticOperationKind.MergeExclusive:
      case SemanticOperationKind.Choose:
      case SemanticOperationKind.SelectMany:
      case SemanticOperationKind.SynchronizeSelected:
      case SemanticOperationKind.ThrowError:
      case SemanticOperationKind.TerminateScope:
      case SemanticOperationKind.ReachNoneEnd:
      case SemanticOperationKind.CompleteScope:
        break;
      default:
        assertNeverDeclarer(operation);
    }
  }
  return { userTask, message, timer, effect };
}

/**
 * Refuses an operation family whose declared wait elements this owner has not classified.
 *
 * Deliberately exhaustive with no wildcard, matching the Lean owner: a catch-all here reads as "this
 * family declares no wait element", so a newly added wait-declaring family produces a state whose
 * hosted element looks undeclared, and the defect surfaces far downstream as an unexplained
 * well-formedness rejection rather than as a compile error.
 */
function assertNeverDeclarer(operation: never): never {
  throw new TypeError(
    `Unclassified wait-declaring operation: ${JSON.stringify(operation)}`,
  );
}

function isSorted<T>(
  values: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): boolean {
  return values.every(
    (value, index) => index === 0 || compare(values[index - 1] as T, value) <= 0,
  );
}

/**
 * The defect classes this owner decides, in a stable order.
 *
 * It decides a **subset** of the reviewed conjunct list, and the subset is stated rather than
 * implied: lifecycle emptiness before start, owner liveness for every wait and hidden record,
 * per-family wait-identity uniqueness, declaration of hosted wait element identities, the
 * `selectMany` and `awaitEventRace` halves of hidden-record declaration, canonical order of the
 * collections whose add sites all insert canonically, and instance agreement. Occurrence uniqueness,
 * effect wait/incident disjointness, token and scope binding, terminal emptiness, and the
 * event-race, called-process, and incident association conjuncts are decided by predicates this
 * package already owns and are not composed in here.
 *
 * Declaration is checked by existence only. Lean additionally requires exactly one declarer and that
 * the declaring operation's scope equal the wait owner's definition scope; this owner checks
 * neither, so the two sides do not decide the same proposition for `RSI-BIND-04` and the parity
 * channel must not treat them as agreeing on it.
 *
 * `expectedInstanceId` is supplied by the caller rather than read from `state.control`, because a
 * validator that took the expectation from the state under check would accept any internally
 * consistent injected state. Both installed call sites pass an identity that cannot disagree, so
 * that conjunct is inert today and no witness claims otherwise.
 *
 * The result is empty for every state the five schedules in the preservation lane reach, including
 * the microsteps inside each stimulus closure. It is not established for every reachable state, and
 * the gap is narrower than the schedule list suggests: those schedules do reach Message waits, Timer
 * waits, event races, selected-branch sets, and called-process records. What they never hold is an
 * effect wait or effect incident, and none exercises the instance scoping on declaration. The
 * quantified Lean obligation is open regardless. Refusing a state here changes no BPMN meaning.
 */
export function runtimeStateDefects(
  program: SemanticProcessProgram,
  expectedInstanceId: string,
  state: RuntimeState,
): ReadonlyArray<RuntimeStateDefect> {
  const defects: RuntimeStateDefect[] = [];

  const programRequiresSequentialMultiInstanceControllers = program.operations.some(
    ({ kind }) => kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  const stateHasSequentialMultiInstanceControllers =
    state.sequentialMultiInstanceControllers !== undefined;
  if (
    programRequiresSequentialMultiInstanceControllers !==
      stateHasSequentialMultiInstanceControllers
  ) {
    defects.push(
      RuntimeStateDefect.SequentialMultiInstanceControllerProfileMismatch,
    );
  }
  const programRequiresParallelMultiInstanceControllers = program.operations.some(
    ({ kind }) => kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
  );
  const stateHasParallelMultiInstanceControllers =
    state.parallelMultiInstanceControllers !== undefined;
  if (
    programRequiresParallelMultiInstanceControllers !==
      stateHasParallelMultiInstanceControllers
  ) {
    defects.push(RuntimeStateDefect.ParallelMultiInstanceControllerProfileMismatch);
  }
  const compensationDefects = compensationRetentionStateDefects(program, state);
  if (
    compensationDefects.includes(
      CompensationRetentionStateDefect.ProgramPresenceMismatch,
    )
  ) {
    defects.push(RuntimeStateDefect.CompensationActivityRetentionProfileMismatch);
  }
  if (compensationDefects.some((defect) =>
    defect !== CompensationRetentionStateDefect.ProgramPresenceMismatch
  )) {
    defects.push(RuntimeStateDefect.CompensationActivityRetentionInvalid);
  }

  if (state.control.kind === ControlStateKind.NotStarted) {
    const started =
      state.initiationPending ||
      state.scopeOccurrences.length > 0 ||
      state.controlTokens.length > 0 ||
      state.userTaskWaits.length > 0 ||
      state.messageWaits.length > 0 ||
      state.timerWaits.length > 0 ||
      state.effectWaits.length > 0 ||
      state.effectIncidents.length > 0 ||
      state.selectedBranchSets.length > 0 ||
      state.eventRaces.length > 0 ||
      state.calledProcessOccurrences.length > 0 ||
      state.activityOccurrences.length > 0 ||
      (state.sequentialMultiInstanceControllers?.length ?? 0) > 0 ||
      (state.parallelMultiInstanceControllers?.length ?? 0) > 0;
    return started
      ? [...defects, RuntimeStateDefect.NotStartedWithWork]
      : defects;
  }

  if (state.control.instanceId !== expectedInstanceId) {
    defects.push(RuntimeStateDefect.ForeignInstance);
  }

  const owned = (owner: ScopeOccurrenceId): boolean =>
    state.scopeOccurrences.filter(({ id }) => sameScopeOccurrence(id, owner)).length === 1;
  const ownersLive =
    state.userTaskWaits.every(({ owner }) => owned(owner)) &&
    state.messageWaits.every(({ owner }) => owned(owner)) &&
    state.timerWaits.every(({ owner }) => owned(owner)) &&
    state.effectWaits.every(({ owner }) => owned(owner)) &&
    state.effectIncidents.every(({ wait }) => owned(wait.owner)) &&
    state.selectedBranchSets.every(({ owner }) => owned(owner)) &&
    state.eventRaces.every(({ owner }) => owned(owner)) &&
    state.calledProcessOccurrences.every(({ caller }) => owned(caller)) &&
    state.activityOccurrences.every(({ owner }) => owned(owner));
  if (!ownersLive) {
    defects.push(RuntimeStateDefect.DanglingWaitOwner);
  }

  const duplicated =
    sharesAnOccurrenceKey(state.userTaskWaits) ||
    sharesAnOccurrenceKey(state.messageWaits) ||
    sharesAnOccurrenceKey(state.timerWaits) ||
    sharesAnOccurrenceKey(state.effectWaits);
  if (duplicated) {
    defects.push(RuntimeStateDefect.DuplicateWaitIdentity);
  }

  if (!runtimeStateIdentityBound(state)) {
    defects.push(RuntimeStateDefect.LiveIdentityAboveCounter);
  }

  const declared = declaredElementIds(program);
  // Only waits of the hosting instance are decidable here. A called Process may be a separate
  // definition this state does not carry, in which case its waits name element identities the
  // caller's operations never declare, and requiring otherwise would reject that state. This is a
  // bound on what the supplied program can decide, not a claim that a called wait is undeclared.
  //
  // No executed schedule witnesses the scoping: the Call Activity fixtures carry both scopes'
  // operations in one program, so their called waits are declared and removing this guard leaves
  // the preservation lane green. What it is load-bearing for is a hand-built incident-cancellation
  // state holding a called-instance Timer the program does not declare. Broadening the conjunct
  // needs the called definitions reachable from the state, which is a representation change with
  // its own witnesses.
  const hosted = (id: OccurrenceId): boolean => id.processInstanceId === expectedInstanceId;
  const undeclared =
    !state.userTaskWaits.every(({ id }) => !hosted(id) || declared.userTask.has(id.elementId)) ||
    !state.messageWaits.every(({ id }) => !hosted(id) || declared.message.has(id.elementId)) ||
    !state.timerWaits.every(({ id }) => !hosted(id) || declared.timer.has(id.elementId)) ||
    !state.effectWaits.every(({ id }) => !hosted(id) || declared.effect.has(id.elementId)) ||
    !state.effectIncidents.every(
      ({ wait }) => !hosted(wait.id) || declared.effect.has(wait.id.elementId),
    );
  if (undeclared) {
    defects.push(RuntimeStateDefect.UndeclaredWaitIdentity);
  }

  const selectionKeys = new Set(
    program.operations.flatMap((operation) =>
      operation.kind === SemanticOperationKind.SelectMany ? [operation.selectionKey] : [],
    ),
  );
  const raceElementIds = new Set(
    program.operations.flatMap((operation) =>
      operation.kind === SemanticOperationKind.AwaitEventRace
        ? [operation.origin.elementId]
        : [],
    ),
  );
  const hiddenRecordsDeclared =
    state.selectedBranchSets.every(({ selectionKey }) => selectionKeys.has(selectionKey)) &&
    state.eventRaces.every(({ id }) => raceElementIds.has(id.elementId));
  if (!hiddenRecordsDeclared) {
    defects.push(RuntimeStateDefect.UndeclaredHiddenRecord);
  }

  defects.push(...activityOwnershipDefects(state));
  defects.push(...sequentialMultiInstanceDefects(program, state));
  defects.push(...parallelMultiInstanceStateDefectCodes(program, state));

  const affectedActivationCounters = [
    state.taskActivations,
    state.messageActivations,
    state.timerActivations,
    state.effectActivations,
  ];
  const ordered =
    isSorted(state.activityOccurrences, compareActivityOccurrences) &&
    isSorted(state.userTaskWaits, compareUserTaskWaits) &&
    isSorted(state.messageWaits, compareMessageWaits) &&
    isSorted(state.timerWaits, compareTimerWaits) &&
    isSorted(state.effectWaits, compareEffectWaits) &&
    isSorted(state.variables.activities, compareActivityVariableScopes) &&
    isSorted(state.selectedBranchSets, compareSelectedBranchSets) &&
    isSorted(state.eventRaces, compareEventRaces) &&
    isSorted(state.calledProcessOccurrences, compareCalledProcessOccurrences) &&
    isSorted(
      state.sequentialMultiInstanceControllers ?? [],
      compareSequentialMultiInstanceControllers,
    ) &&
    isSorted(
      state.parallelMultiInstanceControllers ?? [],
      compareParallelMultiInstanceControllers,
    ) &&
    affectedActivationCounters.every((counters) =>
      isSorted(counters, (left, right) =>
        compareCanonicalStrings(left.elementId, right.elementId),
      )
    );
  if (!ordered) {
    defects.push(RuntimeStateDefect.UnorderedCollection);
  }

  return defects;
}

/**
 * Every way the Activity occurrence records disagree with what they claim to own.
 *
 * The two directions are both required and neither implies the other. A record whose body is gone is
 * an Activity that outlived its own execution, which is what an owner-filtered region removal
 * produces when the handler it strands is owned by a scope outside that region. A handler wait no
 * record lists is the same defect seen from the wait: nothing identifies the Activity it guards, so
 * no cancellation can find it.
 *
 * Ownership agreement is checked too, because a record and its attached wait naming different scope
 * occurrences would let a withdrawal cross a region boundary in the other direction.
 */
/**
 * The controller conjuncts, which are about binding rather than about counting.
 *
 * Nothing here checks a counter, because the representation stores none: planned, generated,
 * completed, pending, and the active loop counter are all functions of the snapshot and the dense
 * output slots, so the equations the capsule states hold by construction and cannot be violated by a
 * state. What a state *can* get wrong is the binding to the record that owns the body, the
 * cardinality of controllers per Activity occurrence, and whether an open controller still has an
 * item left to generate.
 *
 * The exhaustion conjunct is the one that reads like an off-by-one and is not. A controller whose
 * slots cover its whole snapshot should have been removed by the final-completion transition in the
 * same step that filled the last slot, so an open controller with nothing left to generate is a state
 * that transition exists to prevent. An empty snapshot fails the same test, which is correct: a
 * zero-item collection completes atomically at entry and creates no controller at all.
 *
 * The program-aware binding is required even though the record's own `AOO-BODY-01` conjunct already
 * requires one live body. A live child scope is valid for another Activity family, but it cannot be
 * the iteration body of the sequential User Task operation that owns this profile-specific state.
 * The binding therefore resolves the exact operation, record owner, User Task wait, and one attached
 * lifetime Timer before admission.
 */
function sequentialMultiInstanceDefects(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<RuntimeStateDefect> {
  const controllers = state.sequentialMultiInstanceControllers;
  if (controllers === undefined) {
    return [];
  }
  const defects: RuntimeStateDefect[] = [];

  const owned = (controller: SequentialMultiInstanceController): boolean =>
    state.activityOccurrences.filter((record) =>
      sameActivityOccurrence(record.id, controller.id)
    ).length === 1;
  const everyControllerOwned = controllers.every(owned);
  if (!everyControllerOwned) {
    defects.push(RuntimeStateDefect.SequentialMultiInstanceControllerUnowned);
  }

  const duplicateControllers = controllers.some((controller, index) =>
    controllers.some((other, otherIndex) =>
      index !== otherIndex &&
      sameActivityOccurrence(controller.id, other.id)
    )
  );

  const programDeclaresSequentialMultiInstance = program.operations.some(({ kind }) =>
    kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
  );
  if (
    everyControllerOwned &&
    !duplicateControllers &&
    programDeclaresSequentialMultiInstance &&
    sequentialMultiInstanceBindingsForState(program, state) === undefined
  ) {
    defects.push(RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch);
  }

  if (duplicateControllers) {
    defects.push(RuntimeStateDefect.DuplicateSequentialMultiInstanceController);
  }

  if (!controllers.every((controller) =>
    controller.outputSlots.length < controller.snapshot.length
  )) {
    defects.push(RuntimeStateDefect.SequentialMultiInstanceExhausted);
  }

  return defects;
}

function userTaskClaims(body: ActivityBody): ReadonlyArray<OccurrenceId> {
  switch (body.kind) {
    case ActivityBodyKind.UserTask:
      return [body.task];
    case ActivityBodyKind.ParallelUserTasks:
      return body.tasks;
    case ActivityBodyKind.ChildScope:
      return [];
  }
}

function childScopeClaims(body: ActivityBody): ReadonlyArray<ScopeOccurrenceId> {
  switch (body.kind) {
    case ActivityBodyKind.UserTask:
    case ActivityBodyKind.ParallelUserTasks:
      return [];
    case ActivityBodyKind.ChildScope:
      return [body.scope];
  }
}

function activityOwnershipDefects(
  state: RuntimeState,
): ReadonlyArray<RuntimeStateDefect> {
  const defects: RuntimeStateDefect[] = [];

  const bodyLive = ({ body }: ActivityOccurrence): boolean => {
    switch (body.kind) {
      case ActivityBodyKind.UserTask:
        return state.userTaskWaits
          .filter(({ id }) => sameOccurrence(id, body.task)).length === 1;
      case ActivityBodyKind.ParallelUserTasks:
        return body.tasks.every((task) =>
          state.userTaskWaits.filter(({ id }) => sameOccurrence(id, task)).length === 1
        );
      case ActivityBodyKind.ChildScope:
        return state.scopeOccurrences
          .filter(({ id }) => sameScopeOccurrence(id, body.scope)).length === 1;
    }
  };
  const listedHandlersLive = (record: ActivityOccurrence): boolean =>
    record.attachedHandlers.every((handler) => {
      const waits = handler.kind === ActivityHandlerKind.Timer
        ? state.timerWaits
        : state.messageWaits;
      return waits.some(({ id, owner }) =>
        sameOccurrence(id, handler.occurrence) &&
        sameScopeOccurrence(owner, record.owner)
      );
    });
  if (
    !state.activityOccurrences.every((record) =>
      bodyLive(record) && listedHandlersLive(record)
    )
  ) {
    defects.push(RuntimeStateDefect.ActivityOccurrenceBodyAbsent);
  }

  const duplicateBodyClaim = state.activityOccurrences.some((record, index) =>
    state.activityOccurrences.some((other, otherIndex) =>
      index < otherIndex &&
      (
        userTaskClaims(record.body).some((task) =>
          userTaskClaims(other.body).some((otherTask) => sameOccurrence(task, otherTask))
        ) ||
        childScopeClaims(record.body).some((scope) =>
          childScopeClaims(other.body).some((otherScope) =>
            sameScopeOccurrence(scope, otherScope)
          )
        )
      )
    )
  );
  if (duplicateBodyClaim) {
    defects.push(RuntimeStateDefect.DuplicateActivityBodyClaim);
  }

  const listedTimer = (timer: TimerOccurrenceId): number =>
    state.activityOccurrences.filter((record) =>
      attachedTimerOccurrences(record).some((candidate) => sameOccurrence(candidate, timer))
    ).length;
  const listedMessage = (message: MessageSubscriptionId): number =>
    state.activityOccurrences.filter((record) =>
      record.attachedHandlers.some((handler) =>
        handler.kind === ActivityHandlerKind.Message &&
        sameOccurrence(handler.occurrence, message)
      )
    ).length;
  // Only a wait an Activity occurrence claims can be judged here. An ordinary catch, event-race
  // arm, or other unattached wait is listed by no record and remains admitted, so the criterion is
  // "at most one" rather than "exactly one".
  if (
    !state.timerWaits.every(({ id }) => listedTimer(id) <= 1) ||
    !state.messageWaits.every(({ id }) => listedMessage(id) <= 1)
  ) {
    defects.push(RuntimeStateDefect.UnownedAttachedWait);
  }

  if (state.activityOccurrences.some((record, index) =>
    state.activityOccurrences.some((other, otherIndex) =>
      index !== otherIndex && sameActivityOccurrence(record.id, other.id)
    )
  )) {
    defects.push(RuntimeStateDefect.DuplicateActivityOccurrence);
  }

  return defects;
}

/** Whether this committed state is one the account admits. */
export function isWellFormedRuntimeState(
  program: SemanticProcessProgram,
  expectedInstanceId: string,
  state: RuntimeState,
): boolean {
  return runtimeStateDefects(program, expectedInstanceId, state).length === 0;
}

/**
 * Every activation-counter, Activity-issuing, or End-history regression from `before` to `after`.
 *
 * Activation counters are per-key high-water marks and `endOccurrences` never decreases. A lower
 * value is a rewind. Independently, an Activity occurrence newly present in `after` must have an
 * activation above its element's predecessor high-water mark. That pair criterion distinguishes a
 * new issue from body turnover, which preserves the exact outer Activity identity, and from
 * withdrawal, which adds no successor identity.
 */
export function runtimeStateRegressions(
  before: RuntimeState,
  after: RuntimeState,
): ReadonlyArray<RuntimeStateRegression> {
  const regressions: RuntimeStateRegression[] = [];
  const counterFamilies = [
    [before.taskActivations, after.taskActivations],
    [before.messageActivations, after.messageActivations],
    [before.timerActivations, after.timerActivations],
    [before.effectActivations, after.effectActivations],
    [before.eventRaceActivations, after.eventRaceActivations],
    [before.callActivations, after.callActivations],
    [before.scopeActivations, after.scopeActivations],
    [before.activityActivations, after.activityActivations],
  ] as const;

  const rewound = counterFamilies.some(([previous, next]) => {
    const reached = new Map(next.map(({ elementId, count }) => [elementId, count]));
    return previous.some(({ elementId, count }) => (reached.get(elementId) ?? 0) < count);
  });
  if (rewound) {
    regressions.push(RuntimeStateRegression.ActivationCounter);
  }
  const invalidActivityIssue = after.activityOccurrences.some((record) => {
    const alreadyLive = before.activityOccurrences.some((previous) =>
      sameActivityOccurrence(previous.id, record.id)
    );
    const predecessorMark = before.activityActivations.find(
      ({ elementId }) => elementId === record.id.activityElementId,
    )?.count ?? 0;
    return !alreadyLive && record.id.activation <= predecessorMark;
  });
  if (invalidActivityIssue) {
    regressions.push(RuntimeStateRegression.ActivityOccurrenceIssue);
  }
  if (after.endOccurrences < before.endOccurrences) {
    regressions.push(RuntimeStateRegression.EndOccurrences);
  }
  return regressions;
}

/**
 * The defect classes the fail-closed command boundary may refuse on.
 *
 * Deliberately narrower than {@link runtimeStateDefects}. The program-agreement classes are excluded
 * because deciding them needs the complete definition, and the program handed to a command is only
 * the hosting one: whenever a called instance is live its waits name elements the caller's
 * operations never declare. The same limit shows up for any state whose elements the supplied
 * program does not fully declare, so gating on those classes would refuse states this repository
 * already builds and treats as legitimate.
 *
 * This is a recorded boundary, not a claim that program agreement is unimportant. It remains a
 * conjunct of well-formedness and is what refuses an injected wait identity in the validator and in
 * the cross-language rejection channel; only the *gate* is restricted. Closing it needs the called
 * definitions reachable from the state, which is a representation change with its own witnesses.
 */
const GATED_DEFECTS: ReadonlySet<RuntimeStateDefect> = new Set([
  RuntimeStateDefect.ForeignInstance,
  RuntimeStateDefect.NotStartedWithWork,
  RuntimeStateDefect.DanglingWaitOwner,
  RuntimeStateDefect.DuplicateWaitIdentity,
  RuntimeStateDefect.LiveIdentityAboveCounter,
  RuntimeStateDefect.UnorderedCollection,
  // All four are decidable from one state without the called definitions, which is what the gate
  // excludes program-agreement classes for. Leaving them out meant no boundary refused a record whose
  // body was gone, so a continuation could carry one across a Run and `AOO-REFUSE-01`'s state clause
  // held nowhere.
  RuntimeStateDefect.ActivityOccurrenceBodyAbsent,
  RuntimeStateDefect.DuplicateActivityBodyClaim,
  RuntimeStateDefect.UnownedAttachedWait,
  RuntimeStateDefect.DuplicateActivityOccurrence,
  // Presence is decidable from the supplied program and one state, unlike the wait-declaration
  // classes excluded above. Gating it prevents both a profile-owned collection disappearing across
  // a Run and the optional field changing every older profile's canonical state shape.
  RuntimeStateDefect.SequentialMultiInstanceControllerProfileMismatch,
  // The controller classes join for the same reason: each is decidable from one state without the
  // called definitions, and a continuation that carried an unowned or exhausted controller across a
  // Run would otherwise be admitted by every boundary.
  RuntimeStateDefect.SequentialMultiInstanceControllerUnowned,
  RuntimeStateDefect.SequentialMultiInstanceControllerBindingMismatch,
  RuntimeStateDefect.DuplicateSequentialMultiInstanceController,
  RuntimeStateDefect.SequentialMultiInstanceExhausted,
  RuntimeStateDefect.ParallelMultiInstanceControllerProfileMismatch,
  RuntimeStateDefect.ParallelMultiInstanceControllerUnowned,
  RuntimeStateDefect.ParallelMultiInstanceControllerBindingMismatch,
  RuntimeStateDefect.DuplicateParallelMultiInstanceController,
  RuntimeStateDefect.ParallelMultiInstanceExhausted,
  RuntimeStateDefect.CompensationActivityRetentionProfileMismatch,
  RuntimeStateDefect.CompensationActivityRetentionInvalid,
]);

/**
 * Whether the fail-closed command boundary admits this committed state.
 *
 * Preservation before enforcement is the rule this follows, and its evidence is the core's own
 * preservation lane over five schedules, which asserts both directions: that no successor is refused
 * and that every stimulus commits, the second being what catches a conjunct that wrongly refuses a
 * reachable state. The gate was nonetheless wired before that lane existed, inverting the order the
 * owner decision requires. Treat a newly refused state as a defect in this owner until the state is
 * shown unreachable.
 */
export function isGateAdmissibleRuntimeState(
  program: SemanticProcessProgram,
  expectedInstanceId: string,
  state: RuntimeState,
): boolean {
  return runtimeStateDefects(program, expectedInstanceId, state).every(
    (defect) => !GATED_DEFECTS.has(defect),
  );
}
