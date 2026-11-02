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

/**
 * The arrival of one incoming Sequence Flow at a None End with several (NEF-END-01). An End with one incoming flow keeps
 * `operationId`, so a Program lowered before fan-in keeps its exact operation identities.
 */
export function noneEndArrivalOperationId(endId: string, flowId: string): string {
  return `${operationId(endId)}:from:${flowId}`;
}

/** The external child-completion operation paired to one parallel Multi-Instance entry. */
export function parallelCompletionOperationId(elementId: string): string {
  return `${operationId(elementId)}:complete`;
}
