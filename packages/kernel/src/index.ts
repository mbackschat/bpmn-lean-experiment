/** The kernel's public entry points: the scenario, host-view and population runners, the IL codec and the host interface. */
export {
  capabilitiesJson,
  hostViewJson,
  observationJson,
  runHostView,
  runPopulation,
  runScenario,
  unsupportedDeploymentResult,
} from "./run.js";
export {
  CodecRefusalCode,
  bindingsFromJson,
  decodeProgram,
  decodeValue,
  encodeProgram,
  encodeValue,
  parseStrict,
  type Decoded,
  type JsonValue,
} from "./il/codec.js";
export { channelFromJson, failureCode, failureName, stimulusFromJson } from "./il/codec/stimulus.js";
export { admit } from "./admission-registry.js";
export { hooks } from "./registry.js";
export { step } from "./step.js";
export { definitionCapabilities, hostRequirements, hostView } from "./host.js";
export { WorkTag, elementActivity, elementHeader } from "./il/types.js";
export type { Program, Value } from "./il/types.js";
export { EffectOutcomeTag, FailureTag, InputTag } from "./state.js";
export type { CorrelationMatch, EffectOutcome, Input, MessageChannel, OccurrenceRef, Outcome, State } from "./state.js";
export { matching } from "./population.js";
export type { DeploymentRef } from "./population.js";
