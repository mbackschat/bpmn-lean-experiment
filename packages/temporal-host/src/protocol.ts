/**
 * The Workflow's public contract, shared by the Workflow, its Worker and its clients: the start and continuation
 * arguments, the Updates that carry inputs, the queries, and the Activities. The data types live in
 * `host-contract.ts`, free of the SDK; this module adds the SDK definitions.
 *
 * Inputs travel as scenario stimuli, decoded by the kernel's own stimulus codec, so the host adds no input format of
 * its own. A rejected Update is refused by its validator and never enters Event History.
 */
import { defineQuery, defineUpdate } from "@temporalio/workflow";

import type { CommandResult, HostSnapshot } from "./host-contract.js";
import type { EffectRequest, ScriptRequest } from "./host-machine.js";
import type { PublicationPage } from "./publication.js";
import type { EffectResult, JsonValue } from "./port.js";

export {
  ResultKind,
  RunKind,
  Scheduling,
  rejectionType,
  workflowType,
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

/** The canonical state observation, `null` before a committed start. */
export const observationQuery = defineQuery<JsonValue>("observation");
export const hostViewQuery = defineQuery<HostSnapshot>("hostView");
export const publicationQuery = defineQuery<PublicationPage, [afterRevision: number, limit: number]>("publication");

export interface HostActivities {
  readonly executeEffect: (request: EffectRequest) => Promise<EffectResult>;
  readonly evaluateScript: (request: ScriptRequest) => Promise<EffectResult>;
}
