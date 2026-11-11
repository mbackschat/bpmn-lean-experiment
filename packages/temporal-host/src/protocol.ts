/**
 * The Workflow's public contract, shared by the Workflow, its Worker and its clients: the start and continuation
 * arguments, the Updates that carry inputs, the queries, and the Activities. The data types live in
 * `host-contract.ts`, free of the SDK; this module adds the SDK definitions.
 *
 * Inputs travel as scenario stimuli, decoded by the kernel's own stimulus codec, so the host adds no input format of
 * its own. A rejected Update is refused by its validator and never enters Event History.
 */
import { defineQuery, defineUpdate } from "@temporalio/workflow";

import type { CandidateMatches, CorrelationQuestion, IngressState, Registration, RegistrationRequest, ScanRequest, TargetDelivery } from "./correlation.js";
import type { CommandResult, CorrelatedPublication, HostSnapshot, PublicationResult } from "./host-contract.js";
import type { EffectRequest, ScriptRequest } from "./host-machine.js";
import type { PublicationPage } from "./publication.js";
import type { EffectResult, JsonValue, OccurrenceId, ReachOutcome, Wire } from "./port.js";
import type {
  ChainRegistration,
  ChainSignalAnswer,
  DeploymentAnswer,
  DeploymentRequest,
  EmitReference,
  HeldIntents,
  PopulationActivities,
  PopulationCommandOutcome,
  PopulationCommandRequest,
  PopulationDelivery,
  PopulationStartAnswer,
  SignalQuestion,
} from "./population-contract.js";

export {
  PublicationOutcome,
  ResultKind,
  RunKind,
  Scheduling,
  correlationAmbiguousCode,
  ingressWorkflowType,
  notCorrelatedCode,
  rejectionType,
  snapshotView,
  workflowClosed,
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

export const commandUpdate = defineUpdate<CommandResult, [JsonValue]>("command");
export const deliverUpdate = defineUpdate<CommandResult, [JsonValue]>("deliver");
export const timerFireUpdate = defineUpdate<CommandResult, [JsonValue]>("timerFire");
export const effectResultUpdate = defineUpdate<CommandResult, [JsonValue]>("effectResult");

/** The canonical state observation, `null` before a committed start. */
export const observationQuery = defineQuery<JsonValue>("observation");
export const hostViewQuery = defineQuery<HostSnapshot>("hostView");
/**
 * The encoded committed kernel state, `null` before a committed start. Only a scenario runner reads it, so that the
 * kernel, not the host, judges an input the ended chain can no longer receive.
 */
export const stateQuery = defineQuery<JsonValue>("state");
export const publicationQuery = defineQuery<PublicationPage, [afterRevision: number, limit: number]>("publication");

/**
 * Resolves once the instance's open waits are registered and the Signals it threw are handed to its population; returns
 * the publication head.
 */
export const settleUpdate = defineUpdate<number>("settle");
/** The open waits of the instance a correlated delivery would reach now (`KernelPort.matching`). */
export const correlationQuery = defineQuery<readonly OccurrenceId[], [CorrelationQuestion]>("correlationMatches");

/** A correlation ingress's arguments; `carried` is its state across Continue-As-New, `null` on first start. */
export interface IngressArgs {
  readonly correlationScope: string;
  readonly channel: JsonValue;
  readonly carried: IngressState | null;
}

export const registerUpdate = defineUpdate<void, [Registration]>("register");
export const publishUpdate = defineUpdate<PublicationResult, [CorrelatedPublication]>("publish");

export const registerDeploymentUpdate = defineUpdate<DeploymentAnswer, [DeploymentRequest]>("registerDeployment");
/** A chain's registration; answers the ingress's refusal code, `null` when registered. */
export const populationRegisterUpdate = defineUpdate<string | null, [ChainRegistration]>("register");
export const populationCommandUpdate = defineUpdate<PopulationCommandOutcome, [PopulationCommandRequest]>("command");
export const populationEmitUpdate = defineUpdate<void, [EmitReference]>("emit");
/** A command's recorded answer, `{kind: "pending"}` while queued or in flight, `{kind: "unknown"}` otherwise. */
export const populationResultQuery = defineQuery<JsonValue, [commandId: string]>("populationResult");
/** The answer a deployment request received, `null` for a request never registered. */
export const populationDeploymentQuery = defineQuery<DeploymentAnswer | null, [deploymentRequestId: string]>("deployment");
/** How many commands and hand-offs the ingress has queued or in flight. */
export const populationBacklogQuery = defineQuery<number>("populationBacklog");

export const deploymentProgramQuery = defineQuery<JsonValue>("program");
export const deploymentSignalStartsQuery =
  defineQuery<Readonly<{ receivers: readonly Wire[]; refusesVariables: boolean }>, [address: Wire, variables: Wire]>("startReceivers");
export const deploymentMessageStartsQuery = defineQuery<readonly (readonly [string, Wire])[], [message: Wire]>("messageStartCandidates");
export const deploymentConditionalStartsQuery = defineQuery<readonly string[]>("conditionalStarts");

export const populationSignalQuery = defineQuery<ChainSignalAnswer, [SignalQuestion]>("signalReceivers");
export const populationMessageQuery = defineQuery<readonly (readonly [Wire, Wire])[], [publication: Wire]>("messageReceivers");
export const pendingIntentsQuery = defineQuery<HeldIntents | null, [commandId: string]>("pendingIntents");
export const populationDeliverUpdate = defineUpdate<ReachOutcome, [PopulationDelivery]>("populationDeliver");
export const emitSettledUpdate = defineUpdate<void, [commandId: string]>("emitSettled");
/**
 * The outcome of the chain's population start; sent with the start (Update-with-Start). A chain no population start
 * made answers `identityInUse` at once.
 */
export const populationStartedUpdate = defineUpdate<PopulationStartAnswer>("populationStart");
export const populationStartOutcomeQuery = defineQuery<ReachOutcome | null>("populationStartOutcome");

export interface HostActivities extends PopulationActivities {
  readonly executeEffect: (request: EffectRequest) => Promise<EffectResult>;
  readonly evaluateScript: (request: ScriptRequest) => Promise<EffectResult>;
  /** Applies a process's registration at its ingress, starting the ingress if none runs. */
  readonly registerCorrelation: (request: RegistrationRequest) => Promise<void>;
  /** Asks every candidate chain which of its open waits match. */
  readonly scanCorrelation: (request: ScanRequest) => Promise<readonly CandidateMatches[]>;
  /** Submits the delivery to the sole matching wait's chain and returns that chain's verdict. */
  readonly deliverCorrelated: (request: TargetDelivery) => Promise<CommandResult>;
}
