/**
 * Refusal tests of `admission/propagation.ts`: an End Event throws only what `feature/propagation.ts` raises. An Error
 * message must be literal, a Compensation names no Activity and waits for its handlers, a Message throw runs only in
 * CIB's forms and carries no Data Input Associations, and a Signal throw carries `camunda:in` copies and a business key only where a Signal carries variables.
 */
import {
  append, computed, end, flow, literalValue, mapping, qName, refusalTests, replace, scope, start, task, text, variable, withFlows,
  withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `E` becomes an End Event throwing `record`. */
const throwing = (record: Json | string) => (program: Json): Json => replace(program, "E", end("E", record));

const errorThrow = (message: Json | null): Json => ({ error: { payload: { code: "Failure", message } } });
/** `T` becomes a Transaction whose start `XS` reaches a Cancel End `X`. */
const cancelledTransaction = (program: Json): Json =>
  withFlows(append(task(scope("T", { transaction: { payload: { method: "compensate" } } }))(program),
    start("XS", null, [], "T"), end("X", "cancel", "T")), flow("fx", "XS", "X"));

/** A Signal throw with `over` replacing its fields. */
const signalThrow = (over: Json): Json => ({
  signal: {
    payload: { signalRef: qName("Sig"), name: text("S"), payload: [], propagateAll: null, localOnly: false, businessKey: null, asynchronous: false, ...over },
  },
});

/** A Message throw bound to `binding`, or unbound, with `payload` as its Data Input Associations. */
const messageThrow = (binding: Json | null, payload: Json[] = []): Json => ({ message: { payload: { binding, handlerKey: null, payload } } });
const binding: Json = { protocol: "urn:p", operation: "urn:send" };
/** The profile selection that runs CIB's Message throw forms (CIB-EXT-0039, CIB-INT-0027). */
const cibForms: Json = { messageThrowForms: "cibForms" };

/** The profile selection under which a Signal carries variables read at the Events level (CIB-EXT-0040, CIB-EXT-0043). */
const carrying: Json = { signalPayload: "variables", evaluator: "juel" };

const compensation = (over: Json): Json => ({ compensation: { payload: { activity: null, waitForCompletion: true, ...over } } });

export const rows: readonly Row[] = [
  {
    code: "throw.error.message",
    description: "an Error whose message is an expression",
    mutate: throwing(errorThrow(computed(variable("reason")))),
    control: throwing(errorThrow(text("failed"))),
  },
  {
    code: "throw.message.unbound",
    description: "a Message throw without a binding under the standards reading",
    mutate: throwing(messageThrow(null)),
    control: (program) => withOptions(throwing(messageThrow(null))(program), cibForms),
  },
  {
    code: "throw.message.bound",
    description: "a Message throw bound to a handler under the standards reading",
    mutate: throwing(messageThrow(binding)),
    control: (program) => withOptions(throwing(messageThrow(binding))(program), cibForms),
  },
  {
    code: "throw.message.payload",
    description: "a Message throw's Data Input Associations, under CIB's forms too",
    mutate: (program) => withOptions(throwing(messageThrow(binding, [mapping("m", variable("order"), "dataAssociation")]))(program), cibForms),
    control: (program) => withOptions(throwing(messageThrow(binding))(program), cibForms),
  },
  {
    code: "signal.unspecified",
    description: "a Signal throw without a signalRef",
    mutate: throwing(signalThrow({ signalRef: null })),
    control: throwing(signalThrow({})),
  },
  {
    code: "throw.signal.asynchronous",
    description: "an asynchronous Signal throw",
    mutate: throwing(signalThrow({ asynchronous: true })),
    control: throwing(signalThrow({})),
  },
  {
    code: "throw.signal.localVariables",
    description: "a Signal throw copying only local variables",
    mutate: throwing(signalThrow({ propagateAll: 0, localOnly: true })),
    control: (program) => throwing(signalThrow({ propagateAll: 0 }))(withOptions(program, carrying)),
  },
  {
    code: "throw.signal.dataInput",
    description: "a Signal throw with a Data Input Association",
    mutate: (program) => throwing(signalThrow({ payload: [mapping("x", variable("y"), "dataAssociation")] }))(withOptions(program, carrying)),
    control: (program) => throwing(signalThrow({ payload: [mapping("x", variable("y"), "callVariable")] }))(withOptions(program, carrying)),
  },
  {
    code: "throw.signal.payload",
    description: "a Signal throw copying variables where a Signal carries no data",
    mutate: throwing(signalThrow({ payload: [mapping("x", variable("y"), "callVariable")] })),
    control: (program) => throwing(signalThrow({ payload: [mapping("x", variable("y"), "callVariable")] }))(withOptions(program, carrying)),
  },
  {
    code: "throw.signal.payload",
    description: "a Signal throw copying every variable where a Signal carries no data",
    mutate: throwing(signalThrow({ propagateAll: 0 })),
    control: (program) => throwing(signalThrow({ propagateAll: 0 }))(withOptions(program, carrying)),
  },
  {
    code: "throw.signal.businessKey",
    description: "a Signal throw with a business key where a Signal carries no data",
    mutate: throwing(signalThrow({ businessKey: literalValue({ kind: "string", value: "K" }) })),
    control: (program) => throwing(signalThrow({ businessKey: literalValue({ kind: "string", value: "K" }) }))(withOptions(program, carrying)),
  },
  {
    code: "throw.signal.businessKey",
    description: "a Signal throw whose business key expression lies outside the Events level",
    mutate: (program) => throwing(signalThrow({ businessKey: variable("key") }))(withOptions(program, { signalPayload: "variables" })),
    control: (program) => throwing(signalThrow({ businessKey: variable("key") }))(withOptions(program, carrying)),
  },
  {
    code: "signal.unnamed",
    description: "a Signal throw without a name, where names address Signals",
    mutate: (program) => throwing(signalThrow({ name: null }))(withOptions(program, { signalNames: "addresses" })),
    control: (program) => throwing(signalThrow({}))(withOptions(program, { signalNames: "addresses" })),
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
