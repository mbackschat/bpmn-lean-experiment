/**
 * Refusal tests of `admission/data.ts`: a mapping source, an Activity's default flow, a Sequence Flow condition and an
 * element's origin each refuse with one stable code. Only a Simple Boolean condition is read in the kernel, so a
 * literal, variable or foreign condition on a gateway candidate is refused.
 */
import {
  activity, conditionOn, foreign, gateway, literalValue, bool, mapping, refusalTests, simpleBoolean, task, userWork, variable, replace,
  withOrigin,
} from "./admission-refusal-support.ts";
import type { Json, Row } from "./admission-refusal-support.ts";

/** `T` becomes an exclusive gateway whose only candidate is `f2`, the one flow a condition may sit on. */
const gatewayWith = (conditionExpression: Json) => (program: Json): Json =>
  conditionOn(replace(program, "T", gateway("T", { exclusive: { candidates: ["f2"], default: null } })), "f2", conditionExpression);

const userTaskMapping = (source: Json) => task(activity("T", userWork(), { inputs: [mapping("x", source)] }));

export const rows: readonly Row[] = [
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
    code: "activity.defaultFlow",
    description: "an Activity naming a default flow",
    mutate: task(activity("T", "manual", { defaultFlow: "f2" })),
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
    code: "element.origin.definition",
    description: "an element bound to a definition",
    mutate: task(withOrigin(activity("T", "manual"), {
      definition: { key: "Q", version: null, versionTag: null, deployment: null, tenant: null, sourceSha256: null },
      sourceId: "T",
    })),
  },
];

refusalTests("data", rows);
