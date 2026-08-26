import { StimulusKind, VariableValueKind } from "./contract.js";
import type { Stimulus, VariableBinding } from "./contract.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import {
  ParallelMultiInstanceCompletionPolicy,
  parallelMultiInstanceCompletionPolicyBinding,
} from "./parallel-multi-instance-contract.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import { utf8ByteLength } from "./wire.js";

export function admittedParallelMultiInstanceInputCollection(
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  bindings: ReadonlyArray<VariableBinding>,
): ReadonlyArray<string> | undefined {
  const collections = bindings.filter(({ name }) =>
    name === operation.data.input.dataObjectReferenceId
  );
  const policies = bindings.filter(({ name }) =>
    name === parallelMultiInstanceCompletionPolicyBinding
  );
  const collection = collections[0]?.value;
  const policy = policies[0]?.value;
  if (
    bindings.length !== 2 ||
    collections.length !== 1 ||
    policies.length !== 1 ||
    collection?.kind !== VariableValueKind.StringList ||
    policy?.kind !== VariableValueKind.String ||
    (policy.value !== ParallelMultiInstanceCompletionPolicy.All &&
      policy.value !== ParallelMultiInstanceCompletionPolicy.First) ||
    collection.value.length > operation.limits.maximumItems ||
    collection.value.some((item) =>
      utf8ByteLength(item) > operation.limits.maximumItemUtf8Bytes
    ) ||
    utf8ByteLength(JSON.stringify(collection.value)) >
      operation.limits.maximumCanonicalCollectionUtf8Bytes
  ) {
    return undefined;
  }
  return collection.value;
}

export function admittedParallelMultiInstanceCompletionPolicy(
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  bindings: ReadonlyArray<VariableBinding>,
): ParallelMultiInstanceCompletionPolicy | undefined {
  if (admittedParallelMultiInstanceInputCollection(operation, bindings) === undefined) {
    return undefined;
  }
  const policy = bindings.find(({ name }) =>
    name === parallelMultiInstanceCompletionPolicyBinding
  )?.value;
  return policy?.kind === VariableValueKind.String &&
      (policy.value === ParallelMultiInstanceCompletionPolicy.All ||
        policy.value === ParallelMultiInstanceCompletionPolicy.First)
    ? policy.value
    : undefined;
}

export function admittedParallelMultiInstanceChildResult(
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  submittedValues: ReadonlyArray<VariableBinding>,
): string | undefined {
  const [binding] = submittedValues;
  if (
    submittedValues.length !== 1 ||
    binding?.name !== operation.data.output.taskDataOutputId ||
    binding.value.kind !== VariableValueKind.String ||
    utf8ByteLength(binding.value.value) > operation.limits.maximumItemUtf8Bytes
  ) {
    return undefined;
  }
  return binding.value.value;
}

export function parallelMultiInstanceStimulusDataAdmitted(
  program: SemanticProcessProgram,
  stimulus: Stimulus,
): boolean {
  if (
    program.identity.semanticProfile !==
      SemanticProfileId.ParallelMultiInstanceUserTask
  ) {
    return true;
  }
  const entries = program.operations.filter(
    (operation): operation is AwaitParallelMultiInstanceUserTaskOperation =>
      operation.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask,
  );
  const [entry] = entries;
  if (entries.length !== 1 || entry === undefined) {
    return false;
  }
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return admittedParallelMultiInstanceInputCollection(
        entry,
        stimulus.initialVariables,
      ) !== undefined;
    case StimulusKind.CompleteUserTaskInstance:
      return stimulus.taskId.elementId !== entry.task.elementId ||
        admittedParallelMultiInstanceChildResult(
          entry,
          stimulus.submittedValues,
        ) !== undefined;
    default:
      return true;
  }
}
