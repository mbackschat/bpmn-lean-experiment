/** The opaque process locator Product 2 persists: a token only Product 1 interprets. */
import { requireWireString } from "./common.js";
import { engineProcessWorkflowId } from "./host.js";

const locatorPrefix = "bpmn-process:";
declare const engineProcessLocatorBrand: unique symbol;

export type EngineProcessLocator = string & Readonly<{ [engineProcessLocatorBrand]: "EngineProcessLocator" }>;

/** The locator of a directly started or Message-started instance, from its semantic identity. */
export function engineProcessLocatorForCanonicalProcess(processInstanceId: string): EngineProcessLocator {
  return engineProcessLocatorForWorkflowId(engineProcessWorkflowId(processInstanceId));
}

/** The locator of a host Workflow ID, such as the one a Schedule's action reports. */
export function engineProcessLocatorForWorkflowId(workflowId: string): EngineProcessLocator {
  return `${locatorPrefix}${encodeURIComponent(requireWireString(workflowId, "workflowId"))}` as EngineProcessLocator;
}

/** Strictly restores a locator from Product 2's storage. */
export function parseEngineProcessLocator(serialized: string): EngineProcessLocator {
  engineProcessLocatorWorkflowId(serialized);
  return serialized as EngineProcessLocator;
}

export function serializeEngineProcessLocator(locator: EngineProcessLocator): string {
  return parseEngineProcessLocator(locator);
}

/** The host Workflow ID a locator names; for use inside Product 1 only. */
export function engineProcessLocatorWorkflowId(locator: string): string {
  const invalid = new TypeError("Engine process locator is not a canonical token");
  if (typeof locator !== "string" || !locator.startsWith(locatorPrefix)) throw invalid;
  const encoded = locator.slice(locatorPrefix.length);
  let workflowId: string;
  try {
    workflowId = decodeURIComponent(encoded);
  } catch {
    throw invalid;
  }
  if (workflowId.length === 0 || !workflowId.isWellFormed() || encodeURIComponent(workflowId) !== encoded) throw invalid;
  return workflowId;
}
