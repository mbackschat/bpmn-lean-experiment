/**
 * The two identifier conventions the lowering compiler mints for a Semantic Process program.
 *
 * One owner because both prefixes are wire-visible: a control place identifier reaches the program,
 * its JSON Schema, Lean's independent decoder, and runtime token state, so a second spelling would be
 * a silent contract fork rather than a local style difference. The prefix was previously written in
 * three places across the lowering modules, which is what one owner removes.
 */

/** The control place a Sequence Flow lowers to. */
export function controlPlaceId(flowId: string): string {
  return `place:${flowId}`;
}

/** The Semantic Process operation a BPMN Flow Node lowers to. */
export function operationId(elementId: string): string {
  return `operation:${elementId}`;
}
