/**
 * Admission of one interrupting `PT1S` Timer Boundary Event.
 *
 * Only the interrupting form is admitted. The XSD and CMOF default `cancelActivity` to `true`, so an
 * omitted attribute is interrupting; Clause 13.5.3's "if the attribute is not set" must be read as
 * "not set to `true`", because the literal reading would make an omitted attribute non-interrupting.
 * A lexical `false` is a separate proposition and is rejected as the retained hostile control.
 *
 * The exact `PT1S` lexeme is retained rather than normalized here, so Lean converts it to milliseconds
 * independently instead of inheriting this compiler's arithmetic.
 */
import { CheckedNodeKind } from "@bpmn-lean/semantic-core";
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
  if (
    (element.cancelActivity !== undefined && element.cancelActivity !== true) ||
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
        durationLiteral: "PT1S",
        outputFlowId: output.id,
      };
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
