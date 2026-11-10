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
import type { EffectResult, JsonValue, OccurrenceId } from "./port.js";

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

/** Resolves once the instance's open correlated waits are registered; returns the publication head. */
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

export interface HostActivities {
  readonly executeEffect: (request: EffectRequest) => Promise<EffectResult>;
  readonly evaluateScript: (request: ScriptRequest) => Promise<EffectResult>;
  /** Applies a process's registration at its ingress, starting the ingress if none runs. */
  readonly registerCorrelation: (request: RegistrationRequest) => Promise<void>;
  /** Asks every candidate chain which of its open waits match. */
  readonly scanCorrelation: (request: ScanRequest) => Promise<readonly CandidateMatches[]>;
  /** Submits the delivery to the sole matching wait's chain and returns that chain's verdict. */
  readonly deliverCorrelated: (request: TargetDelivery) => Promise<CommandResult>;
}
