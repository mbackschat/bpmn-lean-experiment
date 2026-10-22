import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  isScopeOccurrenceQuiescent,
} from "./semantic-process-scope-runtime.js";
import {
  addToken,
  compareCalledProcessOccurrences,
  compareScopeOccurrenceIds,
  ControlStateKind,
  ownedTokenMultiplicity,
  removeToken,
  sameOccurrence,
  sameScopeOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  CalledProcessOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import { localDataOwnerProcessInstanceId } from "./local-data-owner.js";

/**
 * A Call record's caller is an occurrence of the scope owning its invocation: the root, or an embedded Sub-Process
 * since a Call may sit there. Without the Program this is undecidable, so association validity alone cannot state it.
 * Only a caller in the hosting instance is decided: a caller inside a called instance may run a definition the Program
 * does not carry, the same bound the hosted-wait declaration check observes.
 */
export function callRecordCallerScopeMatches(
  program: SemanticProcessProgram,
  hostingInstanceId: string,
  record: CalledProcessOccurrence,
): boolean {
  if (record.caller.processInstanceId !== hostingInstanceId) return true;
  const invocations = program.operations.filter((operation) =>
    operation.kind === SemanticOperationKind.InvokeProcess &&
    operation.returnOperationId === record.returnOperationId &&
    operation.origin.elementId === record.id.elementId
  );
  const invocation = invocations[0];
  const owners = invocation === undefined
    ? []
    : program.operationScopes.filter(({ operationId }) => operationId === invocation.id);
  return invocations.length === 1 && owners.length === 1 &&
    owners[0]?.scopeId === record.caller.definitionScopeId;
}

/** Encodes the caller, Call Activity, and activation with decimal UTF-8 byte lengths. */
export function deriveCalledProcessInstanceId(
  callerProcessInstanceId: string,
  callActivityElementId: string,
  activation: number,
): string {
  return `call:${utf8ByteLength(callerProcessInstanceId)}:${callerProcessInstanceId}:${utf8ByteLength(callActivityElementId)}:${callActivityElementId}:${activation}`;
}

export function invokeCalledProcess(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.InvokeProcess }
  >,
  state: RuntimeState,
  caller: ScopeOccurrenceId,
): RuntimeState | null {
  const selected = selectCalledProcessInvocation(operation, state, caller);
  if (selected === null) {
    return null;
  }
  const record = selected.record;
  return {
    ...state,
    controlTokens: addToken(
      removeToken(state.controlTokens, operation.input, caller),
      operation.calledEntry,
      record.calledRoot,
    ),
    scopeOccurrences: [
      ...state.scopeOccurrences,
      { id: record.calledRoot, parent: null },
    ].sort(({ id: left }, { id: right }) =>
      compareScopeOccurrenceIds(left, right)
    ),
    calledProcessOccurrences: [
      ...state.calledProcessOccurrences,
      record,
    ].sort(compareCalledProcessOccurrences),
    callActivations: setActivationCount(
      state.callActivations,
      operation.origin.elementId,
      record.id.activation,
    ),
  };
}

export type SelectedCalledProcessInvocation = Readonly<{
  record: CalledProcessOccurrence;
}>;

/** Selects the exact fresh called root and association without applying them. */
export function selectCalledProcessInvocation(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.InvokeProcess }
  >,
  state: RuntimeState,
  caller: ScopeOccurrenceId,
): SelectedCalledProcessInvocation | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    !calledProcessAssociationsAreValid(state) ||
    caller.processInstanceId !== state.control.instanceId ||
    ownedTokenMultiplicity(state.controlTokens, operation.input, caller) !== 1 ||
    state.calledProcessOccurrences.some(
      (record) =>
        sameScopeOccurrence(record.caller, caller) &&
        record.id.elementId === operation.origin.elementId,
    )
  ) {
    return null;
  }
  // The caller is the live occurrence owning the Call's input token, a root or an embedded Sub-Process; scope
  // quiescence counts its Call records, so that occurrence cannot complete while the call is live.
  const callerOccurrences = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, caller)
  );
  if (callerOccurrences.length !== 1) {
    return null;
  }

  const activation =
    (state.callActivations.find(
      ({ elementId }) => elementId === operation.origin.elementId,
    )?.count ?? 0) + 1;
  const calledInstanceId = deriveCalledProcessInstanceId(
    caller.processInstanceId,
    operation.origin.elementId,
    activation,
  );
  const calledRoot = {
    processInstanceId: calledInstanceId,
    definitionScopeId: operation.calledRootScopeId,
    activation: 1,
  };
  const record = {
    id: {
      processInstanceId: caller.processInstanceId,
      elementId: operation.origin.elementId,
      activation,
    },
    caller,
    calledProcessId: operation.calledProcessId,
    calledRoot,
    returnOperationId: operation.returnOperationId,
  } as const satisfies CalledProcessOccurrence;
  if (
    state.scopeOccurrences.some(
      ({ id }) => id.processInstanceId === calledInstanceId,
    ) ||
    state.calledProcessOccurrences.some(
      (candidate) =>
        sameOccurrence(candidate.id, record.id) ||
        candidate.calledRoot.processInstanceId === calledInstanceId,
    )
  ) {
    return null;
  }

  return { record };
}

export function returnCalledProcess(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ReturnProcess }
  >,
  state: RuntimeState,
): RuntimeState | null {
  const selected = selectReturnCalledProcess(operation, state);
  if (selected === null) {
    return null;
  }
  const cleaned = removeCalledProcessTree(state, selected.record);
  return {
    ...cleaned,
    controlTokens: addToken(
      cleaned.controlTokens,
      operation.callerOutput,
      selected.record.caller,
    ),
  };
}

export type SelectedReturnCalledProcess = Readonly<{
  record: CalledProcessOccurrence;
  root: RuntimeState["scopeOccurrences"][number];
}>;

/** Selects the exact enabled Call return without applying its removal or caller continuation. */
export function selectReturnCalledProcess(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ReturnProcess }
  >,
  state: RuntimeState,
): SelectedReturnCalledProcess | null {
  if (
    state.control.kind !== ControlStateKind.Running ||
    !calledProcessAssociationsAreValid(state)
  ) {
    return null;
  }
  const associations = state.calledProcessOccurrences.filter(
    (record) =>
      record.returnOperationId === operation.id &&
      record.id.elementId === operation.origin.elementId,
  );
  const record = associations[0];
  if (
    associations.length !== 1 ||
    record === undefined ||
    record.calledProcessId !== operation.calledProcessId ||
    record.calledRoot.definitionScopeId !== operation.calledRootScopeId
  ) {
    return null;
  }
  const roots = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, record.calledRoot)
  );
  const root = roots[0];
  const callerCount = state.scopeOccurrences.filter(({ id }) =>
    sameScopeOccurrence(id, record.caller)
  ).length;
  if (
    roots.length !== 1 ||
    root === undefined ||
    root.parent !== null ||
    callerCount !== 1 ||
    state.scopeOccurrences.some(
      ({ id, parent }) =>
        id.processInstanceId === record.calledRoot.processInstanceId &&
        parent === null &&
        !sameScopeOccurrence(id, record.calledRoot),
    ) ||
    !isScopeOccurrenceQuiescent(state, root)
  ) {
    return null;
  }
  return { record, root };
}

export function calledProcessAssociationsAreValid(state: RuntimeState): boolean {
  const hostingInstanceId = rootInstanceId(state);
  if (hostingInstanceId === null) {
    return false;
  }
  const hostingRoots = state.scopeOccurrences.filter(
    ({ parent, id }) =>
      parent === null && id.processInstanceId === hostingInstanceId,
  );
  const hostingRoot = hostingRoots[0];
  if (hostingRoots.length !== 1 || hostingRoot === undefined) {
    return false;
  }
  const rootRecords = state.scopeOccurrences.filter(
    ({ parent, id }) =>
      parent === null && id.processInstanceId !== hostingInstanceId,
  );
  const recordsValid = state.calledProcessOccurrences.every(
    (record, index, records) => {
      const callers = state.scopeOccurrences.filter(({ id }) =>
        sameScopeOccurrence(id, record.caller)
      );
      return record.id.processInstanceId === record.caller.processInstanceId &&
        record.id.activation > 0 &&
        callers.length === 1 &&
        record.calledRoot.processInstanceId === deriveCalledProcessInstanceId(
          record.caller.processInstanceId,
          record.id.elementId,
          record.id.activation,
        ) &&
        record.calledRoot.processInstanceId !== hostingInstanceId &&
        record.calledRoot.definitionScopeId !== record.caller.definitionScopeId &&
        record.calledRoot.activation === 1 &&
        records.findIndex(
          (candidate) =>
            sameScopeOccurrence(candidate.caller, record.caller) &&
            candidate.id.elementId === record.id.elementId,
        ) === index &&
        state.scopeOccurrences.filter(({ id, parent }) =>
          parent === null && sameScopeOccurrence(id, record.calledRoot)
        ).length === 1;
    },
  );
  if (
    !recordsValid ||
    !rootRecords.every(({ id }) =>
      state.calledProcessOccurrences.filter(({ calledRoot }) =>
        sameScopeOccurrence(calledRoot, id)
      ).length === 1
    )
  ) {
    return false;
  }

  const reachableInstanceIds = new Set([hostingInstanceId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const record of state.calledProcessOccurrences) {
      if (
        reachableInstanceIds.has(record.caller.processInstanceId) &&
        !reachableInstanceIds.has(record.calledRoot.processInstanceId)
      ) {
        reachableInstanceIds.add(record.calledRoot.processInstanceId);
        expanded = true;
      }
    }
  }
  return state.calledProcessOccurrences.every((record) =>
    reachableInstanceIds.has(record.calledRoot.processInstanceId)
  );
}

export function removeCalledProcessSubtreesForCallers(
  state: RuntimeState,
  callers: ReadonlyArray<ScopeOccurrenceId>,
): RuntimeState {
  const records = state.calledProcessOccurrences.filter(({ caller }) =>
    callers.some((candidate) => sameScopeOccurrence(candidate, caller))
  );
  return records.reduce(removeCalledProcessTree, state);
}

function removeCalledProcessTree(
  state: RuntimeState,
  record: CalledProcessOccurrence,
): RuntimeState {
  const removedInstanceIds = new Set([record.calledRoot.processInstanceId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const candidate of state.calledProcessOccurrences) {
      if (
        removedInstanceIds.has(candidate.caller.processInstanceId) &&
        !removedInstanceIds.has(candidate.calledRoot.processInstanceId)
      ) {
        removedInstanceIds.add(candidate.calledRoot.processInstanceId);
        expanded = true;
      }
    }
  }
  const removedOwner = (owner: ScopeOccurrenceId): boolean =>
    removedInstanceIds.has(owner.processInstanceId);
  return {
    ...state,
    scopeOccurrences: state.scopeOccurrences.filter(({ id }) => !removedOwner(id)),
    // Records owned inside a removed called instance go with it. Regional cancellation cannot reach
    // them: it classifies by subtree membership, and a called root has no runtime parent, so a called
    // instance is removed here instead. Lean's cancellation predicate already covers both because it
    // unions the subtree with the called-instance closure.
    activityOccurrences: state.activityOccurrences.filter(
      ({ owner }) => !removedOwner(owner),
    ),
    ...(state.sequentialScopeControllers === undefined
      ? {}
      : {
        sequentialScopeControllers:
          state.sequentialScopeControllers.filter(
            ({ id }) => !removedInstanceIds.has(id.processInstanceId),
          ),
      }),
    ...(state.parallelScopeControllers === undefined
      ? {}
      : {
        parallelScopeControllers:
          state.parallelScopeControllers.filter(
            ({ id }) => !removedInstanceIds.has(id.processInstanceId),
          ),
      }),
    ...(state.sequentialMultiInstanceControllers === undefined
      ? {}
      : {
        sequentialMultiInstanceControllers:
          state.sequentialMultiInstanceControllers.filter(
            ({ id }) => !removedInstanceIds.has(id.processInstanceId),
          ),
      }),
    ...(state.parallelMultiInstanceControllers === undefined
      ? {}
      : {
        parallelMultiInstanceControllers:
          state.parallelMultiInstanceControllers.filter(
            ({ id }) => !removedInstanceIds.has(id.processInstanceId),
          ),
      }),
    ...(state.compensationActivityRetentions === undefined
      ? {}
      : {
        compensationActivityRetentions:
          state.compensationActivityRetentions.filter(
            ({ owner }) => !removedOwner(owner),
          ),
      }),
    ...(state.compensationParentContextRetentions === undefined
      ? {}
      : {
        compensationParentContextRetentions:
          state.compensationParentContextRetentions.filter(({ parent }) =>
            !removedOwner(parent.id) &&
            (parent.parent === null || !removedOwner(parent.parent))
          ),
      }),
    ...(state.compensationTriggers === undefined
      ? {}
      : {
        compensationTriggers: state.compensationTriggers.filter(
          ({ owner }) => !removedOwner(owner),
        ),
      }),
    ...(state.compensationHandlerEffectWaits === undefined
      ? {}
      : {
        compensationHandlerEffectWaits:
          state.compensationHandlerEffectWaits.filter(
            ({ id, triggerId, handlerId }) =>
              !removedInstanceIds.has(id.processInstanceId) &&
              !removedInstanceIds.has(triggerId.processInstanceId) &&
              !removedInstanceIds.has(handlerId.processInstanceId),
          ),
      }),
    controlTokens: state.controlTokens.filter(({ owner }) => !removedOwner(owner)),
    userTaskWaits: state.userTaskWaits.filter(({ owner }) => !removedOwner(owner)),
    messageWaits: state.messageWaits.filter(({ owner }) => !removedOwner(owner)),
    ...(state.eventSubProcessMessageSubscriptions === undefined ? {} : {
      eventSubProcessMessageSubscriptions: state.eventSubProcessMessageSubscriptions.filter(({ owner }) => !removedOwner(owner)),
    }),
    timerWaits: state.timerWaits.filter(({ owner }) => !removedOwner(owner)),
    effectWaits: state.effectWaits.filter(({ owner }) => !removedOwner(owner)),
    effectIncidents: state.effectIncidents.filter(
      ({ wait }) => !removedOwner(wait.owner),
    ),
    selectedBranchSets: state.selectedBranchSets.filter(({ owner }) => !removedOwner(owner)),
    eventRaces: state.eventRaces.filter(({ owner }) => !removedOwner(owner)),
    calledProcessOccurrences: state.calledProcessOccurrences.filter(
      (candidate) =>
        !sameOccurrence(candidate.id, record.id) &&
        !removedOwner(candidate.caller) &&
        !removedOwner(candidate.calledRoot),
    ),
    variables: {
      ...state.variables,
      scopes: state.variables.scopes.filter(({ owner }) => !removedOwner(owner)),
      processInterfaces: state.variables.processInterfaces.filter(
        ({ owner }) => !removedOwner(owner),
      ),
      activities: state.variables.activities.filter(
        ({ owner }) =>
          !removedInstanceIds.has(localDataOwnerProcessInstanceId(owner)),
      ),
    },
  };
}

function rootInstanceId(state: RuntimeState): string | null {
  return state.control.kind === ControlStateKind.NotStarted
    ? null
    : state.control.instanceId;
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const scalar of value) {
    const codePoint = scalar.codePointAt(0) ?? 0;
    length += codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
      ? 2
      : codePoint <= 0xffff
      ? 3
      : 4;
  }
  return length;
}
