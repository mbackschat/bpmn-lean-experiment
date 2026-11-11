/**
 * Refusal tests of `admission/propagation.ts`: an End Event throws only what `feature/propagation.ts` raises. An Error
 * message must be literal, a Compensation names no Activity and waits for its handlers, and a Message or Signal throw
 * has no kernel meaning.
 */
import { append, computed, end, flow, qName, refusalTests, replace, scope, start, task, text, variable, withFlows } from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `E` becomes an End Event throwing `record`. */
const throwing = (record: Json | string) => (program: Json): Json => replace(program, "E", end("E", record));

const errorThrow = (message: Json | null): Json => ({ error: { payload: { code: "Failure", message } } });
/** `T` becomes a Transaction whose start `XS` reaches a Cancel End `X`. */
const cancelledTransaction = (program: Json): Json =>
  withFlows(append(task(scope("T", { transaction: { payload: { method: "compensate" } } }))(program),
    start("XS", null, [], "T"), end("X", "cancel", "T")), flow("fx", "XS", "X"));

const compensation = (over: Json): Json => ({ compensation: { payload: { activity: null, waitForCompletion: true, ...over } } });

export const rows: readonly Row[] = [
  {
    code: "throw.error.message",
    description: "an Error whose message is an expression",
    mutate: throwing(errorThrow(computed(variable("reason")))),
    control: throwing(errorThrow(text("failed"))),
  },
  {
    code: "throw.message",
    description: "a Message throw",
    mutate: throwing({ message: { payload: { binding: null, payload: [] } } }),
    control: throwing("none"),
  },
  {
    code: "throw.signal",
    description: "a Signal throw",
    mutate: throwing({
      signal: { payload: { signalRef: qName("Sig"), name: text("S"), payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false } },
    }),
    control: throwing("none"),
  },
  {
    code: "throw.compensation.activity",
    description: "a Compensation naming the Activity to compensate",
    mutate: throwing(compensation({ activity: "T" })),
    control: throwing(compensation({})),
  },
  {
    code: "throw.compensation.asynchronous",
    description: "a Compensation that does not wait for its handlers",
    mutate: throwing(compensation({ waitForCompletion: false })),
    control: throwing(compensation({})),
  },
  {
    code: "throw.cancel.outsideTransaction",
    description: "a Cancel End outside a Transaction",
    mutate: throwing("cancel"),
    control: cancelledTransaction,
  },
];

refusalTests("propagation", rows);
