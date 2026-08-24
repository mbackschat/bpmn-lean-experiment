import {
  StimulusKind,
  VariableValueKind,
  type Stimulus,
  type VariableBinding,
} from "./contract.js";
import {
  SemanticOperationKind,
  type AwaitSequentialMultiInstanceUserTaskOperation,
  type SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { utf8ByteLength } from "./wire.js";

/** The one sequential Multi-Instance operation selected by the registered program shape. */
export function sequentialMultiInstanceOperation(
  program: SemanticProcessProgram,
): AwaitSequentialMultiInstanceUserTaskOperation | undefined {
  const operations = program.operations.filter(
    (operation): operation is AwaitSequentialMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  return operations.length === 1 ? operations[0] : undefined;
}

/** Whether one ordered collection fits every bound carried by the admitted operation. */
export function sequentialMultiInstanceCollectionWithinLimits(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  collection: ReadonlyArray<string>,
): boolean {
  const { maximumItems, maximumItemUtf8Bytes, maximumCanonicalCollectionUtf8Bytes } =
    operation.limits;
  return collection.length <= maximumItems &&
    collection.every((item) => utf8ByteLength(item) <= maximumItemUtf8Bytes) &&
    utf8ByteLength(JSON.stringify(collection)) <=
      maximumCanonicalCollectionUtf8Bytes;
}

/** The exact Process-start collection, including its name, cardinality, kind, and value bounds. */
export function admittedSequentialMultiInstanceInputCollection(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  bindings: ReadonlyArray<VariableBinding>,
): ReadonlyArray<string> | undefined {
  const [binding] = bindings;
  if (
    bindings.length !== 1 ||
    binding === undefined ||
    binding.name !== operation.data.input.dataObjectReferenceId ||
    binding.value.kind !== VariableValueKind.StringList
  ) {
    return undefined;
  }
  return sequentialMultiInstanceCollectionWithinLimits(
      operation,
      binding.value.value,
    )
    ? binding.value.value
    : undefined;
}

/** The exact review-task result, including the candidate collection's complete bounds. */
export function admittedSequentialMultiInstanceIterationResult(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  outputSlots: ReadonlyArray<string>,
  submitted: ReadonlyArray<VariableBinding>,
): string | undefined {
  const [binding] = submitted;
  if (
    submitted.length !== 1 ||
    binding === undefined ||
    binding.name !== operation.data.output.taskDataOutputId ||
    binding.value.kind !== VariableValueKind.String
  ) {
    return undefined;
  }
  const result = binding.value.value;
  return sequentialMultiInstanceCollectionWithinLimits(
      operation,
      [...outputSlots, result],
    )
    ? result
    : undefined;
}

/**
 * The task-aware external data contract for the registered profile.
 *
 * A profile-by-surface value-kind table cannot express that the repeated review task accepts one
 * named String while the ordinary escalation task in the same program accepts an empty patch. This
 * predicate adds the operation and task identity needed for that decision without weakening the
 * reusable value-kind gate used by every profile.
 */
export function sequentialMultiInstanceStimulusDataAdmitted(
  program: SemanticProcessProgram,
  stimulus: Stimulus,
): boolean {
  if (
    program.identity.semanticProfile !==
      SemanticProfileId.SequentialMultiInstanceUserTask
  ) {
    return true;
  }
  const operation = sequentialMultiInstanceOperation(program);
  if (operation === undefined) {
    return false;
  }
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return admittedSequentialMultiInstanceInputCollection(
        operation,
        stimulus.initialVariables,
      ) !== undefined;
    case StimulusKind.CompleteUserTaskInstance:
      return stimulus.taskId.elementId === operation.task.elementId
        ? admittedSequentialMultiInstanceIterationResult(
          operation,
          [],
          stimulus.submittedValues,
        ) !== undefined
        : stimulus.submittedValues.length === 0;
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.DeliverMessage:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return true;
    default:
      return assertNever(stimulus);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported sequential Multi-Instance stimulus: ${JSON.stringify(value)}`,
  );
}
