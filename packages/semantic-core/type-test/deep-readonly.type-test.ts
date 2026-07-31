import type { DeepReadonly } from "../src/deep-readonly.js";
import type { RuntimeState } from "../src/semantic-process-state.js";
import type {
  SemanticOperation,
} from "../src/semantic-process-contract.js";
import {
  SemanticOperationKind,
} from "../src/semantic-process-contract.js";

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

void callbackResult;
void tuple;
