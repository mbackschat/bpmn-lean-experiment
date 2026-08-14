/** Product 1 ownership of the opaque Process hosting address persisted by Product 2. */
import { isWellFormedWireString } from "@bpmn-lean/semantic-core";
import {
  temporalCanonicalProcessWorkAddress,
} from "@bpmn-lean/temporal-client/process-work";

const locatorPrefix = "bpmn-process-work-v1:";
declare const engineProcessLocatorBrand: unique symbol;

/** Opaque, privately persisted address token interpreted only by Product 1 operations. */
export type EngineProcessLocator = string & Readonly<{
  [engineProcessLocatorBrand]: "EngineProcessLocator";
}>;

/** Mints the canonical direct or Message Start locator from semantic Process identity. */
export function engineProcessLocatorForCanonicalProcess(
  processInstanceId: string,
): EngineProcessLocator {
  requireNonemptyWireString(processInstanceId, "processInstanceId");
  return engineProcessLocatorForWorkflowId(
    temporalCanonicalProcessWorkAddress(processInstanceId),
  );
}

/** Mints a Timer Schedule locator only from the service-returned execution Workflow ID. */
export function engineProcessLocatorForScheduleExecution(
  executionWorkflowId: string,
): EngineProcessLocator {
  return engineProcessLocatorForWorkflowId(
    requireNonemptyWireString(executionWorkflowId, "executionWorkflowId"),
  );
}

/** Mints the stable private token from one exact Product 1 hosting Workflow address. */
export function engineProcessLocatorForWorkflowId(
  workflowId: string,
): EngineProcessLocator {
  requireNonemptyWireString(workflowId, "workflowId");
  return `${locatorPrefix}${encodeURIComponent(workflowId)}` as
    EngineProcessLocator;
}

/** Returns the exact stable private token for durable Product 2 persistence. */
export function serializeEngineProcessLocator(
  locator: EngineProcessLocator,
): string {
  requireLocator(locator);
  return locator;
}

/** Strictly restores one canonical locator token from private persistence. */
export function parseEngineProcessLocator(
  serialized: string,
): EngineProcessLocator {
  requireLocator(serialized);
  return serialized as EngineProcessLocator;
}

/** Decodes the exact hosting Workflow address for use only inside Product 1. */
export function engineProcessWorkflowIdFromLocator(
  locator: EngineProcessLocator,
): string {
  requireLocator(locator);
  return decodeURIComponent(locator.slice(locatorPrefix.length));
}

function requireLocator(value: string): void {
  if (typeof value !== "string" || !value.startsWith(locatorPrefix)) {
    throw new TypeError("Engine Process locator is not a canonical v1 token");
  }
  const encoded = value.slice(locatorPrefix.length);
  let workflowId: string;
  try {
    workflowId = decodeURIComponent(encoded);
  } catch {
    throw new TypeError("Engine Process locator is not a canonical v1 token");
  }
  if (
    workflowId.length === 0 ||
    !isWellFormedWireString(workflowId) ||
    encodeURIComponent(workflowId) !== encoded
  ) {
    throw new TypeError("Engine Process locator is not a canonical v1 token");
  }
}

function requireNonemptyWireString(value: string, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
  return value;
}

/** Compatibility names retained while Work delegates to the neutral Process locator owner. */
export type EngineProcessWorkLocator = EngineProcessLocator;
export const engineProcessWorkLocatorForCanonicalProcess =
  engineProcessLocatorForCanonicalProcess;
export const engineProcessWorkLocatorForScheduleExecution =
  engineProcessLocatorForScheduleExecution;
export const serializeEngineProcessWorkLocator = serializeEngineProcessLocator;
export const parseEngineProcessWorkLocator = parseEngineProcessLocator;
