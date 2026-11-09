/**
 * The Workflow's public contract, shared by the Workflow, its Worker and its clients: the start and continuation
 * arguments, the Updates that carry inputs, the queries, and the Activities.
 *
 * Inputs travel as scenario stimuli, decoded by the kernel's own stimulus codec, so the host adds no input format of
 * its own. A rejected Update is refused by its validator and never enters Event History.
 */
import { defineQuery, defineUpdate } from "@temporalio/workflow";

import type { EffectRequest, ScriptRequest } from "./host-machine.js";
import type { PublicationCursor, PublicationPage } from "./publication.js";
import type { DefinitionRef, EffectResult, HostView, JsonValue } from "./port.js";

/** The Workflow type every process instance runs. */
export const workflowType = "runProcess";

/**
 * Who submits timer firings and effect results. `durable`: the host, from durable timers and Activities, as in
 * production. `external`: the caller, through the `timerFire` and `effectResult` Updates, so a scenario's logical
 * times and effect outcomes stay explicit inputs.
 */
export enum Scheduling {
  Durable = "durable",
  External = "external",
}

export interface HostConfig {
  readonly scheduling: Scheduling;
  readonly definition: DefinitionRef;
  /** Activity start-to-close bound, a transport limit: a breach is retried and never reaches the kernel. */
  readonly effectStartToCloseMs: number;
  /** Overrides the history length derived from the program's requirements, so a test can force a rollover. */
  readonly historyEventBudget: number | null;
}

export enum RunKind {
  Start = "start",
  Continue = "continue",
}

/** `program` is the kernel IL in its wire form, decoded afresh in every Run. */
export type RunProcessArgs =
  | { readonly kind: RunKind.Start; readonly program: JsonValue; readonly config: HostConfig; readonly start: JsonValue }
  | {
      readonly kind: RunKind.Continue;
      readonly program: JsonValue;
      readonly config: HostConfig;
      readonly state: JsonValue;
      readonly cursor: PublicationCursor;
    };

/** The kernel's verdict on one input as a client sees it. A rejection reaches the client as a refused Update. */
export interface CommandResult {
  readonly outcome: string;
  readonly code: string | null;
  /** The publication head after the input; `null` for an input the Workflow never received. */
  readonly revision: number | null;
}

/** A host-generated input the kernel would neither commit nor reject as stale: the schedule cannot go on. */
export interface Halt {
  readonly commandId: string;
  readonly outcome: string;
  readonly code: string;
}

export enum ResultKind {
  Ended = "ended",
  NotStarted = "notStarted",
  Halted = "halted",
  Refused = "refused",
}

export type ProcessResult =
  | { readonly kind: ResultKind.Ended; readonly status: string; readonly revision: number }
  | { readonly kind: ResultKind.NotStarted; readonly outcome: string; readonly code: string }
  | { readonly kind: ResultKind.Halted; readonly halt: Halt; readonly revision: number }
  /** The program is not admitted: the admission registry's code. */
  | { readonly kind: ResultKind.Refused; readonly code: string };

export interface HostSnapshot {
  readonly revision: number;
  /** `null` before a committed start. */
  readonly view: HostView | null;
  readonly halt: Halt | null;
}

export const commandUpdate = defineUpdate<CommandResult, [JsonValue]>("command");
export const deliverUpdate = defineUpdate<CommandResult, [JsonValue]>("deliver");
export const timerFireUpdate = defineUpdate<CommandResult, [JsonValue]>("timerFire");
export const effectResultUpdate = defineUpdate<CommandResult, [JsonValue]>("effectResult");

/** The canonical state observation, `null` before a committed start. */
export const observationQuery = defineQuery<JsonValue>("observation");
export const hostViewQuery = defineQuery<HostSnapshot>("hostView");
export const publicationQuery = defineQuery<PublicationPage, [afterRevision: number, limit: number]>("publication");

/** The failure type a validator refuses with; the message is the kernel's or the host's refusal code. */
export const rejectionType = "rejected";

export interface HostActivities {
  readonly executeEffect: (request: EffectRequest) => Promise<EffectResult>;
  readonly evaluateScript: (request: ScriptRequest) => Promise<EffectResult>;
}
