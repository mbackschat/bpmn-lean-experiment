import {
  CheckedNodeKind,
  SemanticGraphPolicyKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticCheckpointProfileId,
} from "../src/index.js";
import type {
  CheckedNode,
  MergeExclusiveOperation,
  SemanticGraphPolicy,
} from "../src/index.js";

declare const merge: MergeExclusiveOperation;
declare const policy: Extract<
  SemanticGraphPolicy,
  { kind: SemanticGraphPolicyKind.ResumptionBounded }
>;

// @ts-expect-error The checkpoint capability catalog is process-wide immutable
SemanticCheckpointProfileId.UserTaskCycle = "mutated-cycle-profile";

const fourInputMerge = {
  id: "operation:Merge",
  kind: SemanticOperationKind.MergeExclusive,
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Merge" },
  inputs: ["place:A", "place:B", "place:C", "place:D"],
  output: "place:Output",
} as const satisfies MergeExclusiveOperation;

// @ts-expect-error Exclusive Merge top-level fields are immutable
merge.inputs = ["place:Other"];

// @ts-expect-error Exclusive Merge inputs are deeply immutable
merge.inputs[0] = "place:Other";

// @ts-expect-error Exclusive Merge input collections are deeply immutable
merge.inputs.push("place:Other");

// @ts-expect-error Exclusive Merge output is immutable
merge.output = "place:Other";

// @ts-expect-error The profile-owned resumption mapping is deeply immutable
policy.checkedResumptionNodeKinds.push(CheckedNodeKind.UserTask);

// @ts-expect-error The semantic resumption mapping is deeply immutable
policy.semanticResumptionOperationKinds[0] = SemanticOperationKind.AwaitTimer;

const checkedMerge = {
  kind: CheckedNodeKind.ExclusiveMerge,
  id: "Merge",
} as const satisfies CheckedNode;

const checkedMergeWithInventedDirection = {
  kind: CheckedNodeKind.ExclusiveMerge,
  id: "Merge",
  // @ts-expect-error Exclusive Merge carries identity only
  direction: "converging",
} as const satisfies CheckedNode;

void checkedMerge;
void checkedMergeWithInventedDirection;
void fourInputMerge;
void SemanticOperationKind.MergeExclusive;
