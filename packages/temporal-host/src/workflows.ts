/**
 * The Workflow bundle's entry: Temporal registers every exported function as a Workflow type, so this module exports
 * exactly one, under `protocol.workflowType`.
 */
import { kernelPort } from "./kernel-port.js";
import type { ProcessResult, RunProcessArgs } from "./protocol.js";
import { createRunProcess } from "./workflow-host.js";

const run = createRunProcess(kernelPort);

export async function runProcess(args: RunProcessArgs): Promise<ProcessResult> {
  return run(args);
}

export type { ProcessResult, RunProcessArgs } from "./protocol.js";
