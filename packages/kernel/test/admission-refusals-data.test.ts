/**
 * Refusal tests of `admission/data.ts`: a mapping source, an Activity's default flow, a Sequence Flow condition and an
 * element's origin each refuse with one stable code. Only a Simple Boolean condition is read in the kernel, so a
 * literal, variable or foreign condition on a gateway candidate is refused.
 */
import {
  activity, append, boundary, callWork, catchEvent, choice, conditionOn, definitionRef, duration, elementId, end, flow, foreign, juel,
  literalValue, bool, loop, mapping, message, refusalTests, scope, simpleBoolean, start, task, text, userWork, variable, withFlows,
  withOptions, withOrigin,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes an exclusive gateway whose only candidate is `f2`, the one flow a condition may sit on. */
const gatewayWith = (conditionExpression: Json) => (program: Json): Json => conditionOn(choice(["f2"])(program), "f2", conditionExpression);

const userTaskMapping = (source: Json) => task(activity("T", userWork(), { inputs: [mapping("x", source)] }));

/** The same construct under `Evaluator.juel`. */
const underJuel = (mutate: (program: Json) => Json) => (program: Json): Json => withOptions(mutate(program), { evaluator: "juel" });
const a = { identifier: { name: "a" } };
const one = { integer: { digits: "1" } };
/** `${a + 1}`, admitted at Core. */
const admittedJuel = juel(a, one, { binary: { payload: { op: "add", left: 0, right: 1 } } });
const juelInput = (...nodes: Json[]) => underJuel(userTaskMapping(juel(...nodes)));

/**
 * `T` calls `Q`, carried as the copy of deployment 2 that assembly renamed with `suffix`: `QS → QT → QE`, where `QT`
 * hosts a timer boundary `QB` whose source identifier is `boundarySource`.
 */
const callsCopy = (suffix: string, boundarySource = "QB") => (program: Json): Json => {
  const id = (source: string): string => `${source}${suffix}`;
  const authored = (element: Json, source: string): Json => withOrigin(element, { definition: null, sourceId: source });
  const late = boundary(id("QB"), duration("PT1M"), { sourceId: boundarySource });
  const called = task(activity("T", callWork({ calledElement: text("Q") })))(program);
  return {
    ...withFlows(append(called, authored(start(id("QS")), "QS"), authored(activity(id("QT"), "manual", { boundaries: [late] }), "QT"),
      authored(end(id("QE")), "QE")), flow(id("q1"), id("QS"), id("QT")), flow(id("q2"), id("QT"), id("QE")),
    flow(id("q3"), id("QB"), id("QE"))),
    processes: [{ definition: definitionRef("Q", { deployment: 2 }), children: [id("QS"), id("QT"), id("QE")], variables: [], executable: true }],
  };
};

/** `T` becomes a Sub-Process declaring `items`, with the envelope `env`, whose instance runs `TS → inner → TE`. */
const declaring = (items: string[], inner: Json, env: Json = {}) => (program: Json): Json =>
  withFlows(append(task(scope("T", "embedded", { items }, env))(program), start("TS", null, [], "T"), inner, end("TE", "none", "T")),
    flow("t1", "TS", elementId(inner)), flow("t2", elementId(inner), "TE"));
const association = (target: string, source: string, dialect = "dataAssociation"): Json => mapping(target, variable(source), dialect);
const reviewWith = (env: Json): Json => activity("W", userWork(), env, "T");
const review = reviewWith({});
const collection = (name: string): Json =>
  ({ multiInstance: loop({ count: { collection: { items: variable(name) } }, outputDataItem: null }) });

export const rows: readonly Row[] = [
  {
    code: "data.itemInaccessible",
    description: "a Sub-Process's Data Output Association target naming its own Property, which its outputs write outside it",
    mutate: declaring(["P"], review, { outputs: [association("P", "y")] }),
    control: declaring(["P"], review, { outputs: [association("z", "P")] }),
  },
  {
    // A CIB mapping names a variable, not the item: the control keeps the name and changes the dialect.
    code: "data.itemInaccessible",
    description: "a Sub-Process's Data Input Association source naming its own Data Object, which its inputs read outside it",
    mutate: declaring(["P"], review, { inputs: [association("x", "P")] }),
    control: declaring(["P"], review, { inputs: [association("x", "P", "ioParameter")] }),
  },
  {
    code: "data.itemInaccessible",
    description: "a Multi-Instance Sub-Process's collection naming its own Data Object",
    mutate: declaring(["P"], review, collection("P")),
    control: declaring(["P"], review, collection("Q")),
  },
  {
    code: "data.scopedItem",
    description: "a compensation handler's Data Output Association target naming its Sub-Process's Property",
    mutate: declaring(["P"], reviewWith({ forCompensation: true, outputs: [association("P", "y")] })),
    control: declaring(["P"], reviewWith({ outputs: [association("P", "y")] })),
  },
  {
    code: "mapping.expression",
    description: "a User Task input mapping with a JUEL source under Simple Boolean",
    mutate: userTaskMapping(admittedJuel),
    control: underJuel(userTaskMapping(admittedJuel)),
  },
  {
    code: "expression.juel.syntax",
    description: "a CIB mapping whose JUEL text the reader could not parse",
    mutate: underJuel(userTaskMapping(foreign())),
    control: underJuel(userTaskMapping(admittedJuel)),
  },
  {
    code: "expression.juel.site",
    description: "a Data Association mapping with a JUEL source",
    mutate: underJuel(task(activity("T", userWork(), { inputs: [mapping("x", admittedJuel, "dataAssociation")] }))),
    control: underJuel(task(activity("T", userWork(), { inputs: [mapping("x", variable("y"), "dataAssociation")] }))),
  },
  {
    code: "expression.outsideJuel",
    description: "a Simple Boolean mapping source under JUEL",
    mutate: underJuel(userTaskMapping(simpleBoolean())),
    control: underJuel(userTaskMapping(admittedJuel)),
  },
  {
    code: "expression.juel.floatLiteral",
    description: "a floating literal",
    mutate: juelInput({ float: { lexeme: "1.5" } }),
    control: juelInput(one),
  },
  {
    code: "expression.juel.division",
    description: "a division",
    mutate: juelInput(a, one, { binary: { payload: { op: "div", left: 0, right: 1 } } }),
    control: juelInput(a, one, { binary: { payload: { op: "mod", left: 0, right: 1 } } }),
  },
  {
    code: "expression.juel.function",
    description: "a function call",
    mutate: juelInput({ function: { payload: { qualifier: null, name: "now", args: [] } } }),
    control: juelInput(a),
  },
  {
    code: "expression.juel.method",
    description: "a call of an unlisted method",
    mutate: juelInput(a, { call: { payload: { receiver: 0, target: "getClass", args: [] } } }),
    control: juelInput(a, { call: { payload: { receiver: 0, target: "length", args: [] } } }),
  },
  {
    code: "expression.juel.computedMethod",
    description: "a method named by a bracket",
    mutate: juelInput(a, { stringLiteral: { value: "length" } }, { computedCall: { payload: { receiver: 0, name: 1, args: [] } } }),
    control: juelInput(a, { stringLiteral: { value: "length" } }, { bracket: { base: 0, property: 1 } }),
  },
  {
    code: "expression.juel.malformed",
    description: "a child that is not an earlier node",
    mutate: juelInput({ binary: { payload: { op: "add", left: 1, right: 2 } } }, a, one),
    control: juelInput(a, one, { binary: { payload: { op: "add", left: 0, right: 1 } } }),
  },
  {
    code: "expression.juel.malformed",
    description: "an integer lexeme beyond Long",
    mutate: juelInput({ integer: { digits: "9223372036854775808" } }),
    control: juelInput({ integer: { digits: "9223372036854775807" } }),
  },
  {
    code: "expression.juel.method",
    description: "a listed method name with an argument count it has no overload for",
    mutate: juelInput(a, { call: { payload: { receiver: 0, target: "length", args: [0] } } }),
    control: juelInput(a, { call: { payload: { receiver: 0, target: "length", args: [] } } }),
  },
  {
    code: "expression.juel.malformed",
    description: "an empty node table",
    mutate: underJuel(userTaskMapping(juel())),
    control: juelInput(a),
  },
  {
    code: "expression.juel.engineContext",
    description: "the engine object `execution` as a variable read",
    mutate: underJuel(userTaskMapping(variable("execution"))),
    control: underJuel(userTaskMapping(variable("y"))),
  },
  {
    code: "expression.juel.engineContext",
    description: "the engine object `task` as a JUEL identifier",
    mutate: juelInput({ identifier: { name: "task" } }, { dot: { base: 0, property: "id" } }),
    control: juelInput(a, { dot: { base: 0, property: "id" } }),
  },
  {
    code: "expression.juel.multiInstanceCounter",
    description: "a Multi-Instance counter outside the Multi-Instance level",
    mutate: juelInput({ identifier: { name: "loopCounter" } }, one, { binary: { payload: { op: "add", left: 0, right: 1 } } }),
    control: juelInput(a, one, { binary: { payload: { op: "add", left: 0, right: 1 } } }),
  },
  {
    code: "expression.outsideJuel",
    description: "a Simple Boolean condition under JUEL",
    mutate: underJuel(gatewayWith(simpleBoolean())),
    control: underJuel(gatewayWith(variable("flag"))),
  },
  {
    code: "flow.condition.foreign",
    description: "a JUEL condition under Simple Boolean",
    mutate: gatewayWith(admittedJuel),
    control: underJuel(gatewayWith(admittedJuel)),
  },
  {
    code: "mapping.expression",
    description: "a User Task input mapping with a foreign source",
    mutate: userTaskMapping(foreign()),
    control: userTaskMapping(variable("y")),
  },
  {
    code: "mapping.expression",
    description: "a User Task output mapping with a foreign source",
    mutate: task(activity("T", userWork(), { outputs: [mapping("x", foreign())] })),
    control: task(activity("T", userWork(), { outputs: [mapping("x", variable("y"))] })),
  },
  {
    code: "flow.condition.foreign",
    description: "a gateway candidate whose condition is a literal",
    mutate: gatewayWith(literalValue(bool(true))),
    control: gatewayWith(simpleBoolean()),
  },
  {
    code: "flow.condition.foreign",
    description: "a gateway candidate whose condition is a variable read",
    mutate: gatewayWith(variable("flag")),
    control: gatewayWith(simpleBoolean()),
  },
  {
    code: "flow.condition.foreign",
    description: "a gateway candidate whose condition is a foreign expression",
    mutate: gatewayWith(foreign()),
    control: gatewayWith(simpleBoolean()),
  },
  {
    code: "element.origin.sourceId",
    description: "an element whose source identifier differs from its header identifier",
    mutate: task(withOrigin(activity("T", "manual"), { definition: null, sourceId: "Other" })),
  },
  {
    code: "element.origin.sourceId",
    description: "a copy's element renamed with a deploy ordinal other than its process's",
    mutate: callsCopy("@3"),
    control: callsCopy("@2"),
  },
  {
    code: "element.origin.sourceId",
    description: "a root process element renamed as a copy's would be",
    mutate: task(withOrigin(activity("T@2", "manual"), { definition: null, sourceId: "T" })),
  },
  {
    code: "element.origin.sourceId",
    description: "a boundary whose source identifier differs from its identifier renamed by its copy's deployment",
    mutate: callsCopy("@2", "Other"),
    control: callsCopy("@2"),
  },
  {
    code: "element.origin.definition",
    description: "an element bound to a definition",
    mutate: task(withOrigin(activity("T", "manual"), {
      definition: { key: "Q", namespace: null, version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null },
      sourceId: "T",
    })),
  },
];

refusalTests("data", rows);
