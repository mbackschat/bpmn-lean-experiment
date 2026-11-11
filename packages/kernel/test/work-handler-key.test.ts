/**
 * PC-HUM-02, the writable handler key (WORK-SEMANTICS-SPEC "Writable handler key", CIB-LIM-0017): CIB resolves a
 * delegate token such as `${bpmnLeanEffectHandler}` against process variables before its beans
 * (`JuelExpressionManager.java:144-150`), so a variable of the token's name shadows the handler. The IL carries the
 * token of a Service or Send binding (`handlerKey`), and admission refuses a program in which a name CIB installs from
 * the model equals it (`work.handlerKeyName`): form field ids, parameter targets, result variables, loop item names and
 * Call targets. Process-level items are no such names, since CIB installs none of them (`BpmnParse.java:726`). The
 * oracle is the retained `writable-handler-key` answer, where CIB fails the job; a name of another spelling is admitted.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activity, append, base, callWork, definitionRef, end, loop, mapping, refusalOf, refusalTests, replace, serviceWork, task, userWork,
  variable, withOptions,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";
import { grades, resource, ruleProgram } from "./decision-support.ts";

const token = "bpmnLeanEffectHandler";

/** `X`, a Service Task no token begins, bound through the delegate token `token`, ahead of every other element. */
const keyed = (program: Json): Json => ({
  ...program,
  elements: [activity("X", serviceWork("http", "get", token), { incoming: [], outgoing: [] }), ...(program.elements as Json[])],
});

/** `T` declares `name` through `declare`; the Service Task `X` binds `token`. */
const declaring = (declare: (name: string) => (program: Json) => Json) => (name: string) => (program: Json): Json =>
  keyed(declare(name)(program));

const user = (env: (name: string) => Json, over: (name: string) => Json = () => ({})) => (name: string) =>
  task(activity("T", userWork(over(name)), env(name)));

const called = (name: string) => (program: Json): Json => ({
  ...append(task(activity("T", callWork({ inputs: [mapping(name, variable("source"), "callVariable")] })))(program),
    activity("CT", "manual", { incoming: [], outgoing: [] })),
  processes: [{ definition: definitionRef("Called"), children: ["CT"], variables: [], executable: true }],
});

const declarations: ReadonlyArray<readonly [string, (name: string) => (program: Json) => Json]> = [
  ["a form field id", user(() => ({}), (name) => ({ formFields: [[name, "string"]] }))],
  ["an input parameter target", user((name) => ({ inputs: [mapping(name, variable("y"))] }))],
  ["an output parameter target", user((name) => ({ outputs: [mapping(name, variable("y"))] }))],
  ["an input data item", user((name) => ({ multiInstance: loop({ inputDataItem: name }) }))],
  // CIB binds the `inputDataItem`'s `name` as the element variable (`BpmnParse.java:1869-1872`).
  ["an input data item name", user((name) => ({ multiInstance: loop({ inputDataItem: "item", inputDataItemName: name }) }))],
  ["a Call input target", called],
  ["a decision result variable", (name) => () => ruleProgram({ resultVariable: name }, [resource([grades("d", "unique")])])],
];

/**
 * `E` a Message End bound through the delegate token `token` under CIB's forms (CIB-EXT-0039), which CIB resolves as a
 * Service Task's; `T` declares `name` as a form field id.
 */
const messageEnd = (name: string) => (program: Json): Json => withOptions(replace(
  user(() => ({}), (field) => ({ formFields: [[field, "string"]] }))(name)(program), "E",
  end("E", { message: { payload: { binding: { protocol: "urn:p", operation: "urn:send" }, handlerKey: token, payload: [] } } })),
{ messageThrowForms: "cibForms" });

const rows: Row[] = [
  {
    code: "work.handlerKeyName",
    description: "a form field id named like the delegate token a Message throw binds",
    mutate: messageEnd(token),
    control: messageEnd("note"),
  },
  ...declarations.map(([description, declare]) => ({
    code: "work.handlerKeyName",
    description: `${description} named like a delegate token another task binds`,
    mutate: declaring(declare)(token),
    control: declaring(declare)("note"),
  })),
  // `multiInstance.elementVariable` refuses every element variable, so the name is in the extent ahead of its admission.
  {
    code: "work.handlerKeyName",
    description: "an element variable named like a delegate token another task binds",
    mutate: declaring(user((name) => ({ multiInstance: loop({ elementVariable: name }) })))(token),
  },
];

refusalTests("work handler key", rows);

test("a Service Task's own parameter named like its token is refused", () => {
  const own = (name: string) =>
    task(activity("T", serviceWork("http", "get", token), { inputs: [mapping(name, variable("y"))] }))(base());
  assert.equal(refusalOf(own(token)), "work.handlerKeyName");
  assert.equal(refusalOf(own("note")), null);
});

test("a process item named like the token is admitted, since CIB installs no process-level item", () => {
  assert.equal(refusalOf({ ...keyed(base()), variables: [token] }), null);
});
