/**
 * The Workflow's public contract, shared by the Workflow, its Worker and its clients: the start and continuation
 * arguments, the Updates that carry inputs, the queries, and the Activities. The data types live in
 * `host-contract.ts`, free of the SDK; this module adds the SDK definitions.
 *
 * Inputs travel as scenario stimuli, decoded by the kernel's own stimulus codec, so the host adds no input format of
 * its own. A rejected Update is refused by its validator and never enters Event History.
 */
import { defineQuery, defineUpdate } from "@temporalio/workflow";

import type { TextPage } from "./capacity.js";
import type { CommandResult } from "./host-contract.js";
import type { EffectRequest, ScriptRequest } from "./host-machine.js";
import type { PublicationPage } from "./publication.js";
import type { EffectResult, JsonValue, MessageScan, ReachOutcome, Wire } from "./port.js";
import type {
  ChainRegistration,
  ChainSignalAnswer,
  DeploymentAnswer,
  DeploymentRequest,
  EmitReference,
  EmitVerdict,
  EmitWake,
  PopulationActivities,
  PopulationCommandOutcome,
  PopulationCommandRequest,
  PopulationDelivery,
  PopulationStartAnswer,
  SignalQuestion,
} from "./population-contract.js";

export {
  ResultKind,
  RunKind,
  Scheduling,
  rejectionType,
  snapshotView,
  workflowClosed,
  workflowType,
  workflowUnknown,
  type CommandResult,
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

/*
 * The chain's snapshot Queries answer pages of their value's canonical JSON from a code-unit offset (`capacity.ts`,
 * `textPage`), so no answer exceeds the Query bound; a reader joins them with `readPages`.
 */
/** The canonical state observation, `null` before a committed start. */
export const observationQuery = defineQuery<TextPage, [from: number]>("observation");
/** The `HostSnapshot`. */
export const hostViewQuery = defineQuery<TextPage, [from: number]>("hostView");
/**
 * The encoded committed kernel state, `null` before a committed start. Only a scenario runner reads it, so that the
 * kernel, not the host, judges an input the ended chain can no longer receive.
 */
export const stateQuery = defineQuery<TextPage, [from: number]>("state");
export const publicationQuery = defineQuery<PublicationPage, [afterRevision: number, limit: number]>("publication");

/**
 * Resolves once the instance's open waits are registered and the Signals it threw are accepted by its population's
 * ingress, which may first defer them; returns the publication head.
 */
export const settleUpdate = defineUpdate<number>("settle");
export const registerDeploymentUpdate = defineUpdate<DeploymentAnswer, [DeploymentRequest]>("registerDeployment");
/** A chain's registration; answers the ingress's refusal code, `null` when registered. */
export const populationRegisterUpdate = defineUpdate<string | null, [ChainRegistration]>("register");
export const populationCommandUpdate = defineUpdate<PopulationCommandOutcome, [PopulationCommandRequest]>("command");
export const populationEmitUpdate = defineUpdate<EmitVerdict, [EmitReference]>("emit");
/** A command's recorded answer, `{kind: "pending"}` while queued or in flight, `{kind: "unknown"}` otherwise. */
export const populationResultQuery = defineQuery<JsonValue, [commandId: string]>("populationResult");
/** The answer a deployment request received, `null` for a request never registered. */
export const populationDeploymentQuery = defineQuery<DeploymentAnswer | null, [deploymentRequestId: string]>("deployment");
/** The deploy ordinals of the registered deployments, in deploy order. */
export const populationDeploymentsQuery = defineQuery<readonly number[]>("deployments");
/** How many commands and hand-offs the ingress has queued or in flight. */
export const populationBacklogQuery = defineQuery<number>("populationBacklog");

export const deploymentProgramQuery = defineQuery<JsonValue>("program");
export const deploymentSignalStartsQuery =
  defineQuery<Readonly<{ receivers: readonly Wire[]; refusesVariables: boolean }>, [address: Wire, variables: Wire]>("startReceivers");
export const deploymentMessageStartsQuery = defineQuery<readonly (readonly [string, Wire])[], [message: Wire]>("messageStartCandidates");
export const deploymentConditionalStartsQuery = defineQuery<readonly string[]>("conditionalStarts");

export const populationSignalQuery = defineQuery<ChainSignalAnswer, [SignalQuestion]>("signalReceivers");
export const populationMessageQuery = defineQuery<MessageScan, [publication: Wire]>("messageReceivers");
/** The `HeldIntents` of a command, `null` once settled or never held. */
export const pendingIntentsQuery = defineQuery<TextPage, [commandId: string, from: number]>("pendingIntents");
export const populationDeliverUpdate = defineUpdate<ReachOutcome, [PopulationDelivery]>("populationDeliver");
export const emitSettledUpdate = defineUpdate<void, [commandId: string]>("emitSettled");
/** The ingress's wake of a chain whose emit it deferred. */
export const emitWakeUpdate = defineUpdate<void, [EmitWake]>("emitWake");
/**
 * The outcome of the chain's population start; sent with the start (Update-with-Start). A chain no population start
 * made answers `identityInUse` at once.
 */
export const populationStartedUpdate = defineUpdate<PopulationStartAnswer>("populationStart");
/** The chain's population start outcome, a `ReachOutcome`, `null` for a chain no population start made. */
export const populationStartOutcomeQuery = defineQuery<TextPage, [from: number]>("populationStartOutcome");

export interface HostActivities extends PopulationActivities {
  readonly executeEffect: (request: EffectRequest) => Promise<EffectResult>;
  readonly evaluateScript: (request: ScriptRequest) => Promise<EffectResult>;
}
