/**
 * The host's client contract without the Temporal SDK: the data contract, the process and Schedule ports, publication
 * pages, and the factory of a deployment's ports. A caller that only composes and drives the host imports this entry,
 * so its declarations type-check without the SDK's; `client` adds the SDK realizations.
 */
export {
  PublicationOutcome,
  ResultKind,
  RunKind,
  Scheduling,
  correlationAmbiguousCode,
  notCorrelatedCode,
  workflowType,
  type CommandResult,
  type CorrelatedPublication,
  type CorrelationTarget,
  type PublicationResult,
  type Halt,
  type HostConfig,
  type HostSnapshot,
  type ProcessResult,
  type RunProcessArgs,
} from "./host-contract.js";
export { canonicalJson } from "./correlation.js";
export { createHostClientRuntime, type HostClientOptions, type HostClientRuntime } from "./host-runtime.js";
export type { HostView, JsonValue, OccurrenceId, Requirements, WaitView } from "./port.js";
export type { ProcessDescription, ProcessHost, StartRequest } from "./process-port.js";
export { PageKind, type Batch, type ExecutionTransition, type OccurrenceTransition, type PublicationPage } from "./publication.js";
export {
  ScheduleCreation,
  SchedulePhase,
  assessSchedule,
  scheduleCatchupWindowMs,
  type ExpectedSchedule,
  type OneShotScheduleRequest,
  type ScheduleAssessment,
  type ScheduleHost,
  type StoredSchedule,
} from "./schedules.js";
