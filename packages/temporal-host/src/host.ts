/**
 * The host's client contract without the Temporal SDK: the data contract, the process, population and Schedule ports,
 * publication pages, and the factory of a deployment's ports. A caller that only composes and drives the host imports this entry,
 * so its declarations type-check without the SDK's; `client` adds the SDK realizations.
 */
export {
  ResultKind,
  RunKind,
  Scheduling,
  workflowType,
  type CommandResult,
  type Halt,
  type HostConfig,
  type HostSnapshot,
  type ProcessResult,
  type RunProcessArgs,
} from "./host-contract.js";
export { canonicalJson } from "./canonical-json.js";
export { CapacityBound, canonicalBytes, capacityCode, chainCapacity } from "./capacity.js";
export {
  PopulationRefused,
  timerFiringWorkflowType,
  type CommandAnswer,
  type DeploymentAnswer,
  type PopulationResult,
  type PopulationScope,
  type RegisteredDeployment,
  type TimerFiringArgs,
} from "./population-contract.js";
export { configurationConflictCode, deploymentRequestConflictCode, queueFullCode } from "./population.js";
export { processInstanceWorkflowId, timerFiringWorkflowId } from "./population-address.js";
export { createHostClientRuntime, type HostClientOptions, type HostClientRuntime } from "./host-runtime.js";
export type { HostView, JsonValue, OccurrenceId, Requirements, WaitView } from "./port.js";
export type { PopulationHost, ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";
export { PageKind, type Batch, type ExecutionTransition, type OccurrenceTransition, type PublicationPage } from "./publication.js";
export {
  ScheduleCreation,
  SchedulePhase,
  assessSchedule,
  scheduleActionAtMs,
  scheduleCatchupWindowMs,
  type ExpectedSchedule,
  type OneShotScheduleRequest,
  type ScheduleAssessment,
  type ScheduleHost,
  type StoredSchedule,
  type TimerFiringOutcome,
} from "./schedules.js";
