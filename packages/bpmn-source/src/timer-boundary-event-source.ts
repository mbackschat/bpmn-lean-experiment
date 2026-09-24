/**
 * Admission of the selected duration or recurring Timer expression at an Activity boundary.
 *
 * `cancelActivity` is resolved to a closed disposition here and nowhere else. The XSD and CMOF
 * default it to `true`, so an omitted attribute is interrupting; Clause 13.5.3's "if the attribute
 * is not set" must be read as "not set to `true`", because the literal reading would make an omitted
 * attribute non-interrupting. Clause 10.5.6 grants a lexical `false` the continuing-Activity
 * behavior directly, which is why the two dispositions are admitted here rather than one being
 * refused. Which of them a given profile accepts is decided by that profile's admission predicate,
 * because both dispositions produce the same checked-node kind.
 *
 * The exact `PT1S` duration or `R/PT1S` cycle lexeme is retained, so Lean normalizes it independently.
 */
import { BoundaryInterruption, CheckedNodeKind, REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID } from "@bpmn-lean/semantic-core";
import type {
  CheckedBoundaryTimerExpression,
  CheckedNode,
  CheckedSequenceFlow,
} from "@bpmn-lean/semantic-core";

import {
  asElement,
  asElementArray,
  hasOnlyModelledKeys,
  readId,
} from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";
import {
  ProjectedFlowElementShape,
  hasOnlyProjectedFlowElementKeys,
} from "./projected-flow-element-keys.js";

export function projectTimerBoundaryEvent(
  element: ElementRecord,
  id: string,
  flows: ReadonlyArray<CheckedSequenceFlow>,
  /** Manifest-owned `$type` of a Timer Event Definition; never re-derived here. */
  timerEventDefinitionType: string,
  semanticProfile: string,
): Extract<
  CheckedNode,
  { kind: CheckedNodeKind.TimerBoundaryEvent }
> | undefined {
  const interruption = readInterruption(element.cancelActivity);
  const expression = readTimerExpression(element.eventDefinitions, timerEventDefinitionType);
  const repeating = expression?.cycleLiteral !== undefined;
  if (
    interruption === undefined ||
    !hasOnlyProjectedFlowElementKeys(
      element,
      ProjectedFlowElementShape.BoundaryEvent,
    ) ||
    expression === undefined ||
    (repeating && (semanticProfile !== REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID ||
      interruption !== BoundaryInterruption.NonInterrupting))
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
        ...expression,
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

function readTimerExpression(
  value: unknown,
  timerEventDefinitionType: string,
): CheckedBoundaryTimerExpression | undefined {
  const definitions = asElementArray(value);
  const definition = definitions?.[0];
  if (definitions?.length !== 1 || definition === undefined ||
      definition.$type !== timerEventDefinitionType ||
      !hasOnlyModelledKeys(definition, ["$type", "timeDuration", "timeCycle"])) {
    return undefined;
  }
  const duration = asElement(definition.timeDuration);
  const cycle = asElement(definition.timeCycle);
  if (duration !== undefined && definition.timeCycle === undefined &&
      hasOnlyModelledKeys(duration, ["$type", "body"]) && duration.body === "PT1S") {
    return { durationLiteral: "PT1S" };
  }
  if (cycle !== undefined && definition.timeDuration === undefined &&
      hasOnlyModelledKeys(cycle, ["$type", "body"]) && cycle.body === "R/PT1S") {
    return { cycleLiteral: "R/PT1S" };
  }
  return undefined;
}
