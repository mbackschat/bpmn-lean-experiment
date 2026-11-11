/**
 * The Temporal addresses of a population ([population ingress](../../../docs/kernel/ARCHITECTURE-SPEC.md#population-ingress)):
 * the ingress, each deployment and each instance a population start makes are named by digests, so no population name,
 * deployment or instance identity shapes a host address, and a command's Update ID carries its content's digest. It
 * hashes with Node's crypto, so only clients and Activities import it, never Workflow code.
 */
import { createHash } from "node:crypto";

import { canonicalJson } from "./correlation.js";
import type { EmitReference, PopulationCommandRequest } from "./population-contract.js";
import type { JsonValue } from "./port.js";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export function populationIngressWorkflowId(population: string): string {
  return `bpmn-population-sha256:${sha256(canonicalJson(["populationIngress", population]))}`;
}

export function deploymentWorkflowId(population: string, deploymentId: number): string {
  return `bpmn-deployment-sha256:${sha256(canonicalJson(["populationDeployment", population, deploymentId]))}`;
}

/** The chain of an instance a population start makes, named by the kernel-derived instance identity. */
export function populationInstanceWorkflowId(population: string, instanceId: string): string {
  return `bpmn-instance-sha256:${sha256(canonicalJson(["populationInstance", population, instanceId]))}`;
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
