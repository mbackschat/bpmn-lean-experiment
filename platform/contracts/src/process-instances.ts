import type { DeployedDefinitionVersion } from "./definitions.js";

/** Public outcomes of starting one exact deployed definition version. */
export const ProcessInstanceStartStatus = {
  Started: "started",
  Rejected: "rejected",
} as const;

export type ProcessInstanceStartStatus =
  typeof ProcessInstanceStartStatus[keyof typeof ProcessInstanceStartStatus];

/** Public identity of one semantic Process instance and its exact definition version. */
export type PublicProcessInstanceIdentity = Readonly<{
  processInstanceId: string;
  definition: DeployedDefinitionVersion;
}>;

/** Opaque engine or host failure returned before a Process instance starts. */
export type ProcessInstanceStartFailure = Readonly<{
  code: string;
  evidence: string;
}>;

export type StartedProcessInstanceResult = Readonly<{
  status: typeof ProcessInstanceStartStatus.Started;
  instance: PublicProcessInstanceIdentity;
}>;

export type RejectedProcessInstanceStartResult = Readonly<{
  status: typeof ProcessInstanceStartStatus.Rejected;
  definition: DeployedDefinitionVersion;
  failure: ProcessInstanceStartFailure;
}>;

export type ProcessInstanceStartResult =
  | StartedProcessInstanceResult
  | RejectedProcessInstanceStartResult;
