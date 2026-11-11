/**
 * The Temporal addresses of a population ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * the ingress, each deployment and each instance a population start makes are named by digests, so no population name,
 * deployment or instance identity shapes a host address, and a command's Update ID carries its content's digest. It
 * hashes with Node's crypto, so only clients and Activities import it, never Workflow code.
 */
import { createHash } from "node:crypto";

import { canonicalJson } from "./canonical-json.js";
import type { EmitReference, PopulationCommandRequest } from "./population-contract.js";
import type { JsonValue } from "./port.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export function populationIngressWorkflowId(population: string): string {
  return `bpmn-population-sha256:${sha256(canonicalJson(["populationIngress", population]))}`;
}

export function deploymentWorkflowId(population: string, deploymentId: number): string {
  return `bpmn-deployment-sha256:${sha256(canonicalJson(["populationDeployment", population, deploymentId]))}`;
}

/**
 * The Workflow ID of the chain hosting the semantic process instance `instanceId`, whoever starts it: an engine client
 * under the caller's identifier, or the population ingress under a kernel-derived one. Instance identities are
 * engine-wide, so a population start and a direct start of one identity are one chain.
 */
export function processInstanceWorkflowId(instanceId: string): string {
  return `bpmn-process-sha256:${sha256(canonicalJson(["semanticProcessInstance", instanceId]))}`;
}

/**
 * The Workflow ID base of the Schedule action that fires one Timer-start occurrence: bound to the occurrence, so every
 * Schedule of it names the same firing Workflow. Temporal appends the action's time to it.
 */
export function timerFiringWorkflowId(population: string, deploymentId: number, startEvent: string, dueMs: number): string {
  return `bpmn-timer-firing-sha256:${sha256(canonicalJson(["timerStartFiring", population, deploymentId, startEvent, dueMs]))}`;
}

/** The digest of a population command's content, which a repeat must equal (population contract §7). */
export function populationCommandDigest(kind: string, command: JsonValue): string {
  return sha256(canonicalJson([kind, command]));
}

/**
 * A command's Update ID. Temporal answers a repeated Update ID with the first result whatever the new arguments are, so
 * the ID carries the content digest: a repeat with other content is a separate Update, answered by the ledger.
 */
export function populationCommandUpdateId(request: PopulationCommandRequest): string {
  return `population:${request.commandId}:${request.digest}`;
}

export function emitUpdateId(reference: EmitReference): string {
  return `emit:${sha256(canonicalJson([reference.workflowId, reference.commandId]))}`;
}
