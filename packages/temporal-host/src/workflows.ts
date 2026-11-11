/**
 * The Workflow bundle's entry: Temporal registers every exported function as a Workflow type, so this module exports
 * exactly the process Workflow, under `protocol.workflowType`, the population ingress, under
 * `populationIngressWorkflowType`, and the deployment Workflow, under `deploymentWorkflowType`.
 */
import { kernelPort } from "./kernel-port.js";
import type { DeploymentArgs, PopulationIngressArgs } from "./population-contract.js";
import { createRunDeployment, createRunPopulationIngress } from "./population-ingress.js";
import { populationPort } from "./population-port.js";
import type { ProcessResult, RunProcessArgs } from "./protocol.js";
import { createRunProcess } from "./workflow-host.js";

const run = createRunProcess(kernelPort, populationPort);
const populationIngress = createRunPopulationIngress(kernelPort, populationPort);
const deployment = createRunDeployment(kernelPort, populationPort);

export async function runPopulationIngress(args: PopulationIngressArgs): Promise<void> {
  return populationIngress(args);
}

export async function runDeployment(args: DeploymentArgs): Promise<void> {
  return deployment(args);
}

export async function runProcess(args: RunProcessArgs): Promise<ProcessResult> {
  return run(args);
}

export type { ProcessResult, RunProcessArgs } from "./protocol.js";
