import type { DeepReadonly } from "./deep-readonly.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";

/** Registered profile identity shared by source, IL, runtime, and host admission. */
export const SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID =
  SemanticProfileId.SequentialMultiInstanceUserTask;

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
