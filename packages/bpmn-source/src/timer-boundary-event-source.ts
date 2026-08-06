/**
 * Admission of one `PT1S` Timer Boundary Event, in either interruption disposition.
 *
 * `cancelActivity` is resolved to a closed disposition here and nowhere else. The XSD and CMOF
 * default it to `true`, so an omitted attribute is interrupting; Clause 13.5.3's "if the attribute
 * is not set" must be read as "not set to `true`", because the literal reading would make an omitted
 * attribute non-interrupting. Clause 10.5.6 grants a lexical `false` the continuing-Activity
 * behavior directly, which is why the two dispositions are admitted here rather than one being
 * refused. Which of them a given profile accepts is decided by that profile's operation multiset,
 * because both dispositions produce the same checked-node kind.
 *
 * The exact `PT1S` lexeme is retained rather than normalized here, so Lean converts it to milliseconds
 * independently instead of inheriting this compiler's arithmetic.
 */
import { BoundaryInterruption, CheckedNodeKind } from "@bpmn-lean/semantic-core";
import type {
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import {
  asElement,
  asElementArray,
  hasOnlyOwnKeys,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

export function projectTimerBoundaryEvent(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  /** Manifest-owned `$type` of a Timer Event Definition; never re-derived here. */
  timerEventDefinitionType: string,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.TimerBoundaryEvent }
> | undefined {
  const interruption = readInterruption(element.cancelActivity);
  if (
    interruption === undefined ||
    !hasOnlyOwnKeys(element, [
      "$type",
      "id",
      "name",
      "attachedToRef",
      "cancelActivity",
      "eventDefinitions",
    ]) ||
    !hasExactPt1sTimerDefinition(element.eventDefinitions, timerEventDefinitionType)
  ) {
    return undefined;
  }
  const attached = asElement(element.attachedToRef);
  const attachedToRef = attached === undefined ? undefined : readId(attached);
  const outputs = flows.filter(({ sourceId }) => sourceId === id);
  const inputs = flows.filter(({ targetId }) => targetId === id);
  const output = outputs[0];
  return attachedToRef === undefined ||
      outputs.length !== 1 ||
      inputs.length !== 0 ||
      output === undefined
    ? undefined
    : {
        kind: CheckedNodeKind.TimerBoundaryEvent,
        id,
        attachedToRef,
        interruption,
        durationLiteral: "PT1S",
        outputFlowId: output.id,
      };
}

/**
 * Resolves the parsed `cancelActivity` attribute, or `undefined` when the value is not admissible.
 *
 * The parser types the attribute as `xsd:boolean`, so a value that is neither boolean nor absent
 * never carried an interruption disposition and must not be defaulted into one.
 */
function readInterruption(value: unknown): BoundaryInterruption | undefined {
  switch (value) {
    case undefined:
    case true:
      return BoundaryInterruption.Interrupting;
    case false:
      return BoundaryInterruption.NonInterrupting;
    default:
      return undefined;
  }
}

function hasExactPt1sTimerDefinition(
  value: unknown,
  timerEventDefinitionType: string,
): boolean {
  const definitions = asElementArray(value);
  const definition = definitions?.[0];
  if (
    definitions === undefined ||
    definitions.length !== 1 ||
    definition === undefined ||
    definition.$type !== timerEventDefinitionType ||
    !hasOnlyOwnKeys(definition, ["$type", "timeDuration"])
  ) {
    return false;
  }
  const duration = asElement(definition.timeDuration);
  return duration !== undefined &&
    hasOnlyOwnKeys(duration, ["$type", "body"]) &&
    duration.body === "PT1S";
}
