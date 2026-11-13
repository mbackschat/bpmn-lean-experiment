/**
 * A population command's result in the engine API's form: the kernel's resolution (`Kernel.Run.resolutionJson`, the
 * `resolution` of [engine-population-result.schema.json](../../../contracts/schemas/engine-population-result.schema.json))
 * with the ingress's command ordinal, and a locator for every instance the host can name. This module decodes that
 * rendering member by member, so a rendering outside the contract is a Product 1 defect that throws `TypeError`.
 *
 * A command's result is read back by its command identifier from the population's ledger, which keeps the most recent
 * settled commands (`populationCapacity.ledger`); an older one, like one never submitted, is `unknown`.
 */
import type { CommandAnswer, PopulationResult } from "@bpmn-lean/temporal-host/host";

import { member, requireWireString, type EngineOccurrenceId } from "./common.js";
import type { EngineHost } from "./host.js";
import {
  engineProcessLocatorForCanonicalProcess,
  engineProcessLocatorForWorkflowId,
  type EngineProcessLocator,
} from "./process-locator.js";

/** A fan-out receiver: a waiting occurrence, or a start Event of a registered deployment (`EngineDeploymentResult`). */
export type EnginePopulationReceiver =
  | Readonly<{ kind: "occurrence"; occurrence: EngineOccurrenceId }>
  | Readonly<{ kind: "start"; deploymentId: number; startEventId: string }>;

/**
 * One receiver of a fan-out, each its own unit of commitment. A started instance carries its locator, since a
 * population start hosts it at its canonical address; `version` is the kernel's version of the deployment's key, as
 * `EngineDeploymentResult.versions` gives it. `skipped` was gone before its turn; `failed` names the kernel's outcome
 * (`rejected`, `rolledBack`, `semanticFailure` or `unsupported`) and its code, or a host refusal code.
 */
export type EngineFanOutEntry =
  | Readonly<{ kind: "delivered"; occurrence: EngineOccurrenceId }>
  | Readonly<{
      kind: "started";
      processInstanceId: string;
      locator: EngineProcessLocator;
      deploymentId: number;
      version: number;
      startEventId: string;
    }>
  | Readonly<{ kind: "skipped"; occurrence: EngineOccurrenceId }>
  | Readonly<{ kind: "failed"; receiver: EnginePopulationReceiver; outcome: string; code: string }>;

export enum EnginePopulationResolutionKind {
  /** Delivered to its sole receiver; `cascade` lists the receivers the Signals that step threw reached, in order. */
  Committed = "committed",
  /** The sole receiver refused the delivery; no instance changed. */
  Failed = "failed",
  /** A start, a broadcast or a Conditional start evaluation: its receivers in the order the population reached them. */
  FanOut = "fanOut",
  NoMatch = "noMatch",
  Ambiguous = "ambiguous",
  /** The population refused the command before any receiver, with the kernel's code or a host refusal code. */
  Rejected = "rejected",
  /** The profile does not support the command; nothing changed. */
  Unsupported = "unsupported",
}

export type EnginePopulationResolution =
  | Readonly<{
      kind: EnginePopulationResolutionKind.Committed;
      target: EngineOccurrenceId;
      locator: EngineProcessLocator;
      cascade: readonly EngineFanOutEntry[];
    }>
  | Readonly<{
      kind: EnginePopulationResolutionKind.Failed;
      target: EngineOccurrenceId;
      locator: EngineProcessLocator;
      outcome: string;
      code: string;
    }>
  | Readonly<{ kind: EnginePopulationResolutionKind.FanOut; entries: readonly EngineFanOutEntry[] }>
  | Readonly<{ kind: EnginePopulationResolutionKind.NoMatch | EnginePopulationResolutionKind.Ambiguous }>
  | Readonly<{ kind: EnginePopulationResolutionKind.Rejected | EnginePopulationResolutionKind.Unsupported; code: string }>;

/**
 * A settled command: `ingressOrdinal` numbers the population's commands in arrival order from 1. A repeated command
 * answers the recorded resolution under the next ordinal, and its ledger entry keeps the first.
 */
export type EnginePopulationCommandResult = Readonly<{
  commandId: string;
  ingressOrdinal: number;
  resolution: EnginePopulationResolution;
}>;

export enum EnginePopulationResultStatus {
  Settled = "settled",
  /** Queued or in flight. */
  Pending = "pending",
  /** Never submitted to this population, or no longer in its ledger. */
  Unknown = "unknown",
}

export type EnginePopulationResultRequest = Readonly<{ host: EngineHost; commandId: string }>;

export type EnginePopulationResultObservation =
  | Readonly<{ status: EnginePopulationResultStatus.Settled; result: EnginePopulationCommandResult }>
  | Readonly<{ status: EnginePopulationResultStatus.Pending | EnginePopulationResultStatus.Unknown }>;

/** The result of the population command `commandId` of `host`'s population, as its ledger records it. */
export async function observeEnginePopulationResult(
  request: EnginePopulationResultRequest,
): Promise<EnginePopulationResultObservation> {
  const recorded: PopulationResult = await request.host.population.result(requireWireString(request.commandId, "commandId"));
  switch (recorded.kind) {
    case "settled":
      return { status: EnginePopulationResultStatus.Settled, result: populationCommandResult(request.host, recorded.answer) };
    case "pending":
      return { status: EnginePopulationResultStatus.Pending };
    case "unknown":
      return { status: EnginePopulationResultStatus.Unknown };
  }
}

/** `answer` in the engine API's form; `answer.chain` is the Workflow ID of the chain a delivery reached. */
export function populationCommandResult(host: EngineHost, answer: CommandAnswer): EnginePopulationCommandResult {
  return {
    commandId: answer.commandId,
    ingressOrdinal: answer.ordinal,
    resolution: resolutionOf(host.population.population, answer),
  };
}

function text(json: unknown, key: string): string {
  const value = member(json, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`a population result's ${key} must be a nonempty string`);
  }
  return value;
}

function natural(json: unknown, key: string): number {
  const value = member(json, key);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`a population result's ${key} must be a natural number`);
  }
  return value;
}

function occurrence(json: unknown): EngineOccurrenceId {
  return {
    processInstanceId: text(json, "processInstanceId"),
    elementId: text(json, "elementId"),
    activation: natural(json, "activation"),
  };
}

function entries(json: unknown, population: string): readonly EngineFanOutEntry[] {
  if (!Array.isArray(json)) throw new TypeError("a population result's entries must be an array");
  return json.map((entry: unknown) => fanOutEntry(entry, population));
}

function receiver(json: unknown): EnginePopulationReceiver {
  const kind = member(json, "kind");
  switch (kind) {
    case "occurrence":
      return { kind, occurrence: occurrence(member(json, "occurrence")) };
    case "start":
      return { kind, deploymentId: natural(json, "deploymentId"), startEventId: text(json, "startEvent") };
  }
  throw new TypeError(`a population receiver is not of kind ${String(kind)}`);
}

function fanOutEntry(json: unknown, population: string): EngineFanOutEntry {
  const kind = member(json, "kind");
  switch (kind) {
    case "delivered":
    case "skipped":
      return { kind, occurrence: occurrence(member(json, "target")) };
    case "started": {
      const processInstanceId = text(json, "instanceId");
      return {
        kind,
        processInstanceId,
        locator: engineProcessLocatorForCanonicalProcess(population, processInstanceId),
        deploymentId: natural(json, "deploymentId"),
        version: natural(json, "version"),
        startEventId: text(json, "startEvent"),
      };
    }
    case "failed":
      return { kind, receiver: receiver(member(json, "target")), outcome: text(json, "outcome"), code: text(json, "code") };
  }
  throw new TypeError(`a fan-out entry is not of kind ${String(kind)}`);
}

function chainLocator(answer: CommandAnswer): EngineProcessLocator {
  if (answer.chain === null) throw new TypeError("a delivery's answer names the chain it reached");
  return engineProcessLocatorForWorkflowId(answer.chain);
}

function resolutionOf(population: string, answer: CommandAnswer): EnginePopulationResolution {
  const json = answer.resolution;
  const kind = member(json, "kind");
  switch (kind) {
    case EnginePopulationResolutionKind.Committed: {
      // The kernel leaves `cascade` out when the cascade reached no receiver (`Kernel.Run.resolutionJson`).
      const cascade = member(json, "cascade");
      return {
        kind,
        target: occurrence(member(json, "target")),
        locator: chainLocator(answer),
        cascade: cascade === undefined ? [] : entries(cascade, population),
      };
    }
    case EnginePopulationResolutionKind.Failed:
      return {
        kind,
        target: occurrence(member(json, "target")),
        locator: chainLocator(answer),
        outcome: text(json, "outcome"),
        code: text(json, "code"),
      };
    case EnginePopulationResolutionKind.FanOut:
      return { kind, entries: entries(member(json, "entries"), population) };
    case EnginePopulationResolutionKind.NoMatch:
    case EnginePopulationResolutionKind.Ambiguous:
      return { kind };
    case EnginePopulationResolutionKind.Rejected:
    case EnginePopulationResolutionKind.Unsupported:
      return { kind, code: text(json, "code") };
  }
  throw new TypeError(`a population resolution is not of kind ${String(kind)}`);
}
