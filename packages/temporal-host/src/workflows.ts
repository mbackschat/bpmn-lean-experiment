/**
 * The Workflow bundle's entry: Temporal registers every exported function as a Workflow type, so this module exports
 * exactly the process Workflow, under `protocol.workflowType`, and the correlation ingress, under
 * `protocol.ingressWorkflowType`.
 */
import { createRunCorrelationIngress } from "./correlation-ingress.js";
import { kernelPort } from "./kernel-port.js";
import type { IngressArgs, ProcessResult, RunProcessArgs } from "./protocol.js";
import { createRunProcess } from "./workflow-host.js";

const run = createRunProcess(kernelPort);
const ingress = createRunCorrelationIngress(kernelPort);

export async function runProcess(args: RunProcessArgs): Promise<ProcessResult> {
  return run(args);
}

export async function runCorrelationIngress(args: IngressArgs): Promise<void> {
  return ingress(args);
}

export type { IngressArgs, ProcessResult, RunProcessArgs } from "./protocol.js";
