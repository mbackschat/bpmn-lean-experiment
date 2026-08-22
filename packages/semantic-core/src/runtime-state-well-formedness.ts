import {
  SemanticOperationKind,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import type { OccurrenceId } from "./contract.js";
import {
  compareCalledProcessOccurrences,
  compareEventRaces,
  compareSelectedBranchSets,
  compareUserTaskWaits,
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
  type RuntimeState,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { compareCanonicalStrings } from "./wire.js";

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
export const RuntimeStateDefect = {
  ForeignInstance: "foreignInstance",
  NotStartedWithWork: "notStartedWithWork",
  DanglingWaitOwner: "danglingWaitOwner",
  DuplicateWaitIdentity: "duplicateWaitIdentity",
  UndeclaredWaitIdentity: "undeclaredWaitIdentity",
  UndeclaredHiddenRecord: "undeclaredHiddenRecord",
  UnorderedCollection: "unorderedCollection",
} as const;

export type RuntimeStateDefect =
  (typeof RuntimeStateDefect)[keyof typeof RuntimeStateDefect];

/** The ways a successor may contradict its predecessor. Separate from {@link RuntimeStateDefect}
 * because neither can be decided from one state: a rewound counter is a property of the pair. */
export const RuntimeStateRegression = {
  ActivationCounter: "activationCounter",
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
        userTask.add(operation.task.elementId);
        break;
      case SemanticOperationKind.AwaitBoundedUserTask:
      case SemanticOperationKind.AwaitMonitoredUserTask:
        userTask.add(operation.task.elementId);
        timer.add(operation.boundaryTimer.elementId);
        break;
      case SemanticOperationKind.EnterBoundedScope:
        timer.add(operation.boundaryTimer.elementId);
        break;
      case SemanticOperationKind.AwaitTimer:
        timer.add(operation.timer.elementId);
        break;
      case SemanticOperationKind.AwaitMessage:
        message.add(operation.message.elementId);
        break;
      case SemanticOperationKind.AwaitEventRace:
        message.add(operation.message.elementId);
        timer.add(operation.timer.elementId);
        break;
      case SemanticOperationKind.AwaitEffect:
        effect.add(operation.origin.elementId);
        break;
      default:
        break;
    }
  }
  return { userTask, message, timer, effect };
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
 * The result is empty for every state the registered corpus reaches with this owner installed,
 * which is what the gates establish. It is not established for every reachable state: no
 * preservation lane exists over the transition arms, so that stronger claim is owed rather than
 * held. Refusing a state here changes no BPMN meaning.
 */
export function runtimeStateDefects(
  program: SemanticProcessProgram,
  expectedInstanceId: string,
  state: RuntimeState,
): ReadonlyArray<RuntimeStateDefect> {
  const defects: RuntimeStateDefect[] = [];

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
      state.calledProcessOccurrences.length > 0;
    return started ? [RuntimeStateDefect.NotStartedWithWork] : [];
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
    state.calledProcessOccurrences.every(({ caller }) => owned(caller));
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

  const declared = declaredElementIds(program);
  // Only waits of the hosting instance are decidable here. A called Process is a separate program
  // that this state does not carry, so its waits carry element identities the caller's operations
  // never declare, and requiring otherwise would reject every live Call Activity tree. This is a
  // bound on what the caller's program can decide, not a claim that a called wait is undeclared:
  // broadening it needs the called definition, which is a representation change with its own
  // witnesses.
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

  const ordered =
    isSorted(state.userTaskWaits, compareUserTaskWaits) &&
    isSorted(state.selectedBranchSets, compareSelectedBranchSets) &&
    isSorted(state.eventRaces, compareEventRaces) &&
    isSorted(state.calledProcessOccurrences, compareCalledProcessOccurrences) &&
    isSorted(state.taskActivations, (left, right) =>
      compareCanonicalStrings(left.elementId, right.elementId),
    );
  if (!ordered) {
    defects.push(RuntimeStateDefect.UnorderedCollection);
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
 * Every way `after` rewinds `before`.
 *
 * Activation counters are per-key high-water marks and `endOccurrences` never decreases, so a
 * successor that lowers either has reissued an identity it already retired. That is what the
 * adapter relies on when it joins a durable deadline to committed state.
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
  ] as const;

  const rewound = counterFamilies.some(([previous, next]) => {
    const reached = new Map(next.map(({ elementId, count }) => [elementId, count]));
    return previous.some(({ elementId, count }) => (reached.get(elementId) ?? 0) < count);
  });
  if (rewound) {
    regressions.push(RuntimeStateRegression.ActivationCounter);
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
  RuntimeStateDefect.UnorderedCollection,
]);

/**
 * Whether the fail-closed command boundary admits this committed state.
 *
 * Preservation before enforcement is the rule this follows, and the evidence for it is not yet a
 * lane. The registered corpus passing with this gate installed is incidental coverage, not a
 * dedicated preservation result, so the owed executable preservation lane is recorded as remaining
 * work rather than treated as held here. Until it exists, treat a newly refused state as a defect in
 * this owner until the state is shown unreachable.
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
