import { compareCanonicalStrings } from "./strict-json.ts";

type Json = Readonly<Record<string, unknown>>;

const asRecord = (value: unknown): Json | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;

/**
 * The variable-binding lists of one stimulus that the scenario protocol keeps canonical: exactly those the CIB runner
 * checks with `ScenarioVariableBindings.requireCanonical` (`ScenarioProtocol`: Start variables, User Task completion and
 * setVariables values, success and BPMN Error outputs).
 */
function bindingLists(stimulus: Json): ReadonlyArray<readonly [string, unknown]> {
  switch (stimulus["kind"]) {
    case "start":
      return [["variables", stimulus["variables"]]];
    case "command": {
      const action = asRecord(stimulus["action"]);
      return action?.["kind"] === "completeUserTask" || action?.["kind"] === "setVariables"
        ? [["values", action["values"]]]
        : [];
    }
    case "effectResult": {
      const outcome = asRecord(stimulus["outcome"]);
      return outcome?.["kind"] === "success" || outcome?.["kind"] === "businessFailure"
        ? [["outputs", outcome["outputs"]]]
        : [];
    }
    default:
      return [];
  }
}

/**
 * Refuses a scenario whose binding list repeats a name or is out of strict ascending Unicode scalar order. The kernel
 * would run such a scenario while the CIB runner refuses it, so its evidence would silently become a harness failure.
 */
export function verifyCanonicalBindingOrder(scenario: Readonly<{ stimuli: ReadonlyArray<unknown> }>): void {
  for (const stimulus of scenario.stimuli) {
    const record = asRecord(stimulus);
    if (record === undefined) continue;
    for (const [field, list] of bindingLists(record)) {
      if (!Array.isArray(list)) continue;
      const names = list.map((binding) => String(asRecord(binding)?.["name"]));
      for (let index = 1; index < names.length; index++) {
        if (compareCanonicalStrings(names[index - 1]!, names[index]!) >= 0) {
          throw new TypeError(`${field} names must be unique and canonically ordered`);
        }
      }
    }
  }
}
