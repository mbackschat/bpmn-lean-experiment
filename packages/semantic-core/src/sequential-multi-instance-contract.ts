import type { DeepReadonly } from "./deep-readonly.js";

/** Reserved source/IL profile identity. It is not execution-registered until the runtime lands. */
export const SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID =
  "bpmn-2.0.2-sequential-multi-instance-user-task-draft" as const;

export type SequentialMultiInstanceInputDefinition = DeepReadonly<{
  collectionItemDefinitionId: string;
  scalarItemDefinitionId: string;
  dataObjectId: string;
  dataObjectReferenceId: string;
  loopDataInputId: string;
  inputDataItemId: string;
  taskDataInputId: string;
  collectionAssociationId: string;
  itemAssociationId: string;
}>;

export type SequentialMultiInstanceOutputDefinition = DeepReadonly<{
  dataObjectId: string;
  dataObjectReferenceId: string;
  taskDataOutputId: string;
  outputDataItemId: string;
  loopDataOutputId: string;
  itemAssociationId: string;
  collectionAssociationId: string;
}>;

export type SequentialMultiInstanceDataDefinition = DeepReadonly<{
  input: SequentialMultiInstanceInputDefinition;
  output: SequentialMultiInstanceOutputDefinition;
}>;

export type SequentialMultiInstanceLimits = DeepReadonly<{
  maximumItems: 16;
  maximumItemUtf8Bytes: 512;
  maximumCanonicalCollectionUtf8Bytes: 8192;
}>;

export const sequentialMultiInstanceLimits: SequentialMultiInstanceLimits =
  Object.freeze({
    maximumItems: 16,
    maximumItemUtf8Bytes: 512,
    maximumCanonicalCollectionUtf8Bytes: 8_192,
  });
