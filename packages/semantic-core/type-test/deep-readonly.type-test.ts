import type { DeepReadonly } from "../src/deep-readonly.js";
import type { RuntimeState } from "../src/semantic-process-state.js";
import type { SemanticOperation } from "../src/semantic-process-contract.js";
import type { SourceOverlayIdentity } from "../src/source-overlay-identity.js";
import { SemanticOperationKind } from "../src/semantic-process-contract.js";

type MutableContract = {
  status: "ready";
  nested: {
    value: number;
    list: Array<{ id: string }>;
    tuple: [{ enabled: boolean }, "tail"];
  };
  choice:
    | { kind: "withPayload"; payload: { text: string } }
    | { kind: "empty" };
  callback: (value: string) => number;
};

declare const contract: DeepReadonly<MutableContract>;
declare const sourceOverlay: SourceOverlayIdentity;

// @ts-expect-error top-level contract fields are immutable
contract.status = "ready";
// @ts-expect-error nested contract fields are immutable
contract.nested.value = 2;
// @ts-expect-error arrays are immutable
contract.nested.list.push({ id: "next" });
// @ts-expect-error array elements are deeply immutable
contract.nested.list[0].id = "changed";
// @ts-expect-error tuples retain their positions and become deeply immutable
contract.nested.tuple[0].enabled = false;
// @ts-expect-error source-overlay identity is immutable
sourceOverlay.id = "changed";
// @ts-expect-error source-overlay digest is immutable
sourceOverlay.sha256 = "0".repeat(64);

if (contract.choice.kind === "withPayload") {
  // @ts-expect-error discriminated-union payloads are deeply immutable
  contract.choice.payload.text = "changed";
}

const callbackResult: number = contract.callback("value");
const tuple: readonly [{ readonly enabled: boolean }, "tail"] =
  contract.nested.tuple;

declare const runtime: RuntimeState;
declare const activity:
  RuntimeState["variables"]["activities"][number];
// @ts-expect-error Process-scope bindings are immutable
runtime.variables.process.bindings = [];
// @ts-expect-error Activity-scope collections are immutable
runtime.variables.activities.push(activity);
// @ts-expect-error Complete occurrence owners are deeply immutable
activity.owner.activation = 2;
// @ts-expect-error Activity-local bindings are deeply immutable
activity.bindings[0] = activity.bindings[0];

declare const errorOperation: Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.ThrowError }
>;
// @ts-expect-error nested resolved Error handlers are deeply immutable
errorOperation.handler.attachedScopeId = "scope:changed";
// @ts-expect-error nested Error origin fields are deeply immutable
errorOperation.handler.origin.sequenceFlowId = "Flow_Changed";

declare const selectMany: Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.SelectMany }
>;
// @ts-expect-error Inclusive candidate tuples are immutable
selectMany.candidates[0] = selectMany.candidates[1];
// @ts-expect-error Inclusive branch-to-join pairing is deeply immutable
selectMany.candidates[0].expectedJoinInput = "place:changed";
// @ts-expect-error hidden selected-branch records are deeply immutable
runtime.selectedBranchSets[0].expectedInputs[0] = "place:changed";

void callbackResult;
void tuple;
