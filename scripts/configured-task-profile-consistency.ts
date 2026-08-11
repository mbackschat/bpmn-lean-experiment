/**
 * Exact profile-owned binding for the selected configured Task extension.
 */
import { isDeepStrictEqual } from "node:util";

const configuredTaskProfileId =
  "bpmn-2.0.2-bpmn-lean-configured-task-effect-draft";

const configuredTaskEffectBindings = Object.freeze([Object.freeze({
  source: Object.freeze({
    taskDefinitionNamespace: "urn:bpmn-lean:bpmn:extensions:v1",
    taskDefinitionType: "urn:bpmn-lean:task-handler:probe-v1",
  }),
  descriptor: Object.freeze({
    protocol: "urn:bpmn-lean:effect-protocol:activity-v1",
    operation: "urn:bpmn-lean:effect-operation:probe-v1",
  }),
})]);

export function verifyConfiguredTaskProfileBinding(
  profile: Readonly<{
    id: string;
    effectBindings?: unknown;
  }>,
): void {
  if (profile.id !== configuredTaskProfileId) {
    return;
  }
  if (!isDeepStrictEqual(
    profile.effectBindings,
    configuredTaskEffectBindings,
  )) {
    throw new Error("configured Task profile binding differs from the selected exact binding");
  }
}
