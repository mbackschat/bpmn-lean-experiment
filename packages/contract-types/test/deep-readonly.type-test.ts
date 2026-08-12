import type { DeepReadonly } from "../src/index.js";

type MutableContract = {
  status: "ready";
  nested: {
    list: Array<{ id: string }>;
    tuple: [{ enabled: boolean }, "tail"];
  };
  choice:
    | { kind: "withPayload"; payload: { text: string } }
    | { kind: "empty" };
  callback: (value: string) => number;
};

declare const opaqueBrand: unique symbol;
type OpaqueString = string & { readonly [opaqueBrand]: "opaque" };

declare const contract: DeepReadonly<MutableContract>;

// @ts-expect-error top-level contract fields are immutable
contract.status = "ready";
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
declare const opaque: DeepReadonly<OpaqueString>;
const retainedOpaque: OpaqueString = opaque;

void callbackResult;
void tuple;
void retainedOpaque;
