import {
  StimulusKind,
  VariableValueKind,
  type ProcessStartStimulus,
  type StartProcessStimulus,
} from "./contract.js";
import {
  CompensationParentContextRetentionKind,
  type CompensationParentContextRetention,
} from "./compensation-event-sub-process-snapshot-contract.js";
import {
  constructPromotedCompensationParentContextRetention,
} from "./compensation-event-sub-process-snapshot.js";
import type {
  CompensationHandlerEffectWait,
  CompensationTriggerExecution,
} from "./compensation-trigger-handler-runtime-contract.js";
import {
  canonicalCompensationExecutionStateUtf8Bytes,
} from "./compensation-trigger-handler-runtime-state-validation.js";
import {
  constructCompensationTriggerFrontier,
  executionFits,
  type SelectedCompensationSubject,
} from "./compensation-trigger-handler-transition.js";
import {
  SemanticOperationKind,
  type SemanticProcessProgram,
  type TriggerCompensationOperation,
} from "./semantic-process-contract.js";
import {
  COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID,
} from "./semantic-profile-catalog.js";
import {
  initialState,
  type RuntimeScopeOccurrence,
  type ScopeOccurrenceId,
} from "./semantic-process-state.js";
import {
  canonicalCompensationParentContextRetentionsUtf8Bytes,
} from "./compensation-event-sub-process-snapshot-state-validation.js";
import { isVariablePatch } from "./variable-value.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

export type CompensationStartCapacityProjection = Readonly<{
  retentions: ReadonlyArray<CompensationParentContextRetention>;
  trigger: CompensationTriggerExecution;
  waits: ReadonlyArray<CompensationHandlerEffectWait>;
  snapshotCanonicalBytes: number;
  executionCanonicalBytes: number;
}>;

/** Applies the exact checkpoint's Program-derived start-data and downstream-capacity rule. */
export function compensationStartDataAdmitted(
  program: SemanticProcessProgram,
  stimulus: ProcessStartStimulus,
): boolean {
  if (
    program.identity.semanticProfile !==
      COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID
  ) {
    return true;
  }
  if (stimulus.kind !== StimulusKind.StartProcess) return true;
  const projection = projectCompensationStartCapacity(program, stimulus);
  const snapshotLimits = program.compensationEventSubProcessSnapshots?.limits;
  return projection !== null && snapshotLimits !== undefined &&
    projection.retentions.length <= snapshotLimits.maxRecords &&
    projection.snapshotCanonicalBytes <= snapshotLimits.maxCanonicalBytes &&
    executionFits(program, [projection.trigger], projection.waits);
}

/** Projects the exact promoted snapshot and maximal first frontier without creating runtime state. */
export function projectCompensationStartCapacity(
  program: SemanticProcessProgram,
  stimulus: StartProcessStimulus,
): CompensationStartCapacityProjection | null {
  if (
    program.identity.semanticProfile !==
      COMPENSATION_SOURCE_CHECKPOINT_PROFILE_ID ||
    stimulus.kind !== StimulusKind.StartProcess ||
    !isWellFormedWireString(stimulus.instanceId) ||
    stimulus.instanceId.length === 0 ||
    !isVariablePatch(stimulus.initialVariables)
  ) {
    return null;
  }
  const declaration = program.compensationExecution;
  const snapshots = program.compensationEventSubProcessSnapshots;
  const operation = triggerOperation(program);
  const root = rootOccurrence(program, stimulus.instanceId);
  if (
    declaration === undefined ||
    snapshots === undefined ||
    operation === undefined ||
    root === null
  ) {
    return null;
  }

  const requiredNames = [...new Set(declaration.subjects.flatMap(({ body }) =>
    body.input.kind === "restoredProcessBinding" ? [body.input.sourceName] : []
  ))].sort(compareCanonicalStrings);
  if (
    requiredNames.length === 0 ||
    stimulus.initialVariables.length !== requiredNames.length ||
    !stimulus.initialVariables.every((binding, index) =>
      binding.name === requiredNames[index] &&
      binding.value.kind === VariableValueKind.String
    )
  ) {
    return null;
  }

  const eventSubjects = declaration.subjects.filter(
    (subject) => subject.kind === "eventSubProcess",
  );
  if (eventSubjects.length !== snapshots.targets.length || eventSubjects.length !== 1) {
    return null;
  }
  const retentions = eventSubjects.flatMap((subject) => {
    if (subject.kind !== "eventSubProcess") return [];
    const parent: RuntimeScopeOccurrence = {
      id: {
        processInstanceId: stimulus.instanceId,
        definitionScopeId: subject.parentScopeId,
        activation: 1,
      },
      parent: root,
    };
    const retention = constructPromotedCompensationParentContextRetention(
      program,
      parent,
      stimulus.initialVariables,
    );
    return retention === null ? [] : [retention];
  });
  if (
    retentions.length !== eventSubjects.length ||
    retentions.some(({ kind }) =>
      kind !== CompensationParentContextRetentionKind.Promoted
    )
  ) {
    return null;
  }

  const selected = selectedSubjects(program, stimulus.instanceId, retentions);
  if (selected === null) return null;
  const frontier = constructCompensationTriggerFrontier(
    program,
    initialState,
    operation,
    root,
    selected,
  );
  if (frontier === null || frontier.trigger.handlers.length !== declaration.subjects.length) {
    return null;
  }
  return {
    retentions,
    trigger: frontier.trigger,
    waits: frontier.waits,
    snapshotCanonicalBytes:
      canonicalCompensationParentContextRetentionsUtf8Bytes(retentions),
    executionCanonicalBytes: canonicalCompensationExecutionStateUtf8Bytes(
      [frontier.trigger],
      frontier.waits,
    ),
  };
}

function selectedSubjects(
  program: SemanticProcessProgram,
  instanceId: string,
  retentions: ReadonlyArray<CompensationParentContextRetention>,
): ReadonlyArray<SelectedCompensationSubject> | null {
  const subjects = program.compensationExecution?.subjects;
  if (subjects === undefined) return null;
  const selected = subjects.flatMap((definition): SelectedCompensationSubject[] => {
    if (definition.kind === "boundaryActivity") {
      return [{
        definition,
        occurrence: {
          kind: "boundaryActivity",
          activity: {
            processInstanceId: instanceId,
            activityElementId: definition.subjectElementId,
            activation: 1,
          },
        },
        restoredContext: null,
      }];
    }
    const matches = retentions.filter((retention) =>
      retention.kind === CompensationParentContextRetentionKind.Promoted &&
      retention.parent.id.definitionScopeId === definition.parentScopeId &&
      retention.handlerScopeId === definition.handlerScopeId
    );
    const retention = matches[0];
    return matches.length === 1 &&
        retention?.kind === CompensationParentContextRetentionKind.Promoted
      ? [{
          definition,
          occurrence: { kind: "eventSubProcess", parent: retention.parent.id },
          restoredContext: retention.snapshot,
        }]
      : [];
  });
  return selected.length === subjects.length ? selected : null;
}

function triggerOperation(
  program: SemanticProcessProgram,
): TriggerCompensationOperation | undefined {
  const operationId = program.compensationExecution?.triggerOperationId;
  return program.operations.find((operation): operation is TriggerCompensationOperation =>
    operation.kind === SemanticOperationKind.TriggerCompensation &&
    operation.id === operationId
  );
}

function rootOccurrence(
  program: SemanticProcessProgram,
  instanceId: string,
): ScopeOccurrenceId | null {
  const roots = program.definitionScopes.filter(({ parentScopeId, originElementId }) =>
    parentScopeId === null && originElementId === program.processId
  );
  const root = roots[0];
  return roots.length === 1 && root !== undefined
    ? { processInstanceId: instanceId, definitionScopeId: root.id, activation: 1 }
    : null;
}
