/**
 * The kernel's public entry points: the scenario, host-view, population and kernel-fixture runners, the IL codec and the
 * host interface.
 */
export {
  capabilitiesJson,
  hostViewJson,
  observationJson,
  runBatchCase,
  runFixture,
  runHostView,
  runPopulation,
  runScenario,
  runStep,
  unsupportedDeploymentResult,
} from "./run.js";
export {
  CodecRefusalCode,
  bindingsFromJson,
  decodeProgram,
  encodeProgram,
  parseStrict,
  type Decoded,
  type JsonValue,
} from "./il/codec.js";
export {
  channelFromJson,
  channelToJson,
  failureCode,
  failureName,
  firingStimulusFromJson,
  signalAddressToJson,
  stimulusFromJson,
  type TimerFiring,
} from "./il/codec/stimulus.js";
export { admit, admitLocated, closureReach, type AdmissionRefusal } from "./admission-registry.js";
export { VisitTag, conditionalCatches, type Closure, type Visit } from "./admission/flow.js";
export { hooks } from "./registry.js";
export { integerBound, textBytes } from "./hooks.js";
export { isJavascriptFormat } from "./admission/work.js";
export { step } from "./step.js";
export { definitionCapabilities, hostRequirements, hostView, refusesSignalVariables, rootStarts } from "./host.js";
export {
  ScopeKindTag, WorkTag, elementActivity, elementHeader, elementScope, programBoundary, programElement, programTarget,
} from "./il/types.js";
export type { Program, Value } from "./il/types.js";
export {
  DeliveryTriggerTag, EffectOutcomeTag, FailureTag, InputTag, LeaveTag, SignalAddressTag, SignalReach, StartTriggerTag,
  leaveFlows,
} from "./state.js";
export { criteriaRefusal, startCriteriaRefusal } from "./state/criteria.js";
export type {
  Binding, BroadcastIntent, CorrelationMatch, EffectOutcome, Failure, Input, Leave, MessageChannel, OccurrenceRef,
  Outcome, SignalAddress, StartInput, StartTrigger, State,
} from "./state.js";
export { matching, messageReceivers, messageStartCandidates } from "./population/messages.js";
export {
  FanOutNextTag,
  PendingTag,
  cascadeBound,
  emissionStartedId,
  inOrder,
  fanOutBegin,
  fanOutNext,
  fanOutPass,
  fanOutRecord,
  fanOutSnapshot,
  linearizeReceivers,
  reachOccurrence,
  signalReceiversOf,
  signalStartReceivers,
  type Emission,
  type FanOutMachine,
  type FanOutNext,
  type OccurrenceReach,
  type Pending,
} from "./population/signals.js";
export { conditionalStartVerdict, type ConditionalStartVerdict } from "./population/conditions.js";
export { currentSummary, deploy, deploymentSummary, registerSummary, type DeploymentSummary } from "./population/deploy.js";
export { timerInstanceId, timerOccurrences, timerStartCheck } from "./population/timers.js";
export {
  definitionRefFromJson, deploymentSourceFromJson, fanOutEntryJson, populationCommandFromJson, resolutionJson, stimuliOfPopulation, type Declared,
} from "./run/population.js";
export {
  CommandTag,
  DefinitionSelectorTag,
  DeploymentOutcomeTag,
  StimulusTag,
  FanOutEntryTag,
  MessageAddressTag,
  PublishMode,
  ReceiverTag,
  ResolutionTag,
  cascadeInstanceId,
  startedInstanceId,
} from "./population/contract.js";
export type {
  Command, DefinitionSelector, Deployment, DeploymentRef, FanOutEntry, Instance, MessageAddress, Publication, Receiver,
  Resolution, Stimulus,
} from "./population/contract.js";
