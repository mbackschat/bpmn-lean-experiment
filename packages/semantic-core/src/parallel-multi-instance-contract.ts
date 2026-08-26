import type { DeepReadonly } from "./deep-readonly.js";
import { SemanticProfileId } from "./semantic-profile-catalog.js";
import type {
  SequentialMultiInstanceDataDefinition,
  SequentialMultiInstanceLimits,
} from "./sequential-multi-instance-contract.js";

/** Registered profile identity shared by source, IL, runtime, and host admission. */
export const PARALLEL_MULTI_INSTANCE_USER_TASK_PROFILE_ID =
  SemanticProfileId.ParallelMultiInstanceUserTask;

/** The parallel profile deliberately reuses the reviewed direct collection data graph. */
export type ParallelMultiInstanceDataDefinition =
  SequentialMultiInstanceDataDefinition;

/** Largest limit admitted by the retained maximal-topology Temporal payload measurement. */
export type ParallelMultiInstanceLimits = SequentialMultiInstanceLimits;

export const parallelMultiInstanceLimits: ParallelMultiInstanceLimits =
  Object.freeze({
    maximumItems: 16,
    maximumItemUtf8Bytes: 512,
    maximumCanonicalCollectionUtf8Bytes: 8_192,
  });

/** Exact Process binding interpreted by the approved completion condition. */
export const parallelMultiInstanceCompletionPolicyBinding = "completionPolicy";

export enum ParallelMultiInstanceCompletionPolicy {
  All = "all",
  First = "first",
}

export type ParallelMultiInstanceCompletionCondition = DeepReadonly<{
  kind: "stringEquals";
  variable: typeof parallelMultiInstanceCompletionPolicyBinding;
  value: ParallelMultiInstanceCompletionPolicy.First;
}>;
