import { decodeDeployedDefinitionVersion } from "./deployed-definition-decoder.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
} from "./decoder-primitives.js";
import {
  ProcessInstanceStartStatus,
} from "./process-instances.js";
import type {
  ProcessInstanceStartFailure,
  ProcessInstanceStartResult,
  PublicProcessInstanceIdentity,
  RejectedProcessInstanceStartResult,
  StartedProcessInstanceResult,
} from "./process-instances.js";

/** Decodes one closed start response and rejects private fields at every level. */
export function decodeProcessInstanceStartResult(
  value: unknown,
): ProcessInstanceStartResult {
  requireObject(value, "process instance start result");
  const status = readOwn(value, "status");
  switch (status) {
    case ProcessInstanceStartStatus.Started:
      return decodeStartedResult(value);
    case ProcessInstanceStartStatus.Rejected:
      return decodeRejectedResult(value);
    default:
      throw new TypeError(
        "process instance start result.status must be started or rejected",
      );
  }
}

function decodeStartedResult(value: object): StartedProcessInstanceResult {
  requireExactKeys(value, "process instance start result", ["instance", "status"]);
  return {
    status: ProcessInstanceStartStatus.Started,
    instance: decodePublicProcessInstanceIdentity(readOwn(value, "instance")),
  };
}

/** Decodes one semantic Process-instance identity and its exact definition. */
export function decodePublicProcessInstanceIdentity(
  value: unknown,
  label = "instance",
): PublicProcessInstanceIdentity {
  requireObject(value, label);
  requireExactKeys(value, label, ["definition", "processInstanceId"]);
  return {
    processInstanceId: requireNonemptyString(
      readOwn(value, "processInstanceId"),
      `${label}.processInstanceId`,
    ),
    definition: decodeDeployedDefinitionVersion(
      readOwn(value, "definition"),
      `${label}.definition`,
    ),
  };
}

function decodeRejectedResult(value: object): RejectedProcessInstanceStartResult {
  requireExactKeys(value, "process instance start result", [
    "definition",
    "failure",
    "status",
  ]);
  return {
    status: ProcessInstanceStartStatus.Rejected,
    definition: decodeDeployedDefinitionVersion(
      readOwn(value, "definition"),
      "definition",
    ),
    failure: decodeStartFailure(readOwn(value, "failure")),
  };
}

function decodeStartFailure(value: unknown): ProcessInstanceStartFailure {
  requireObject(value, "failure");
  requireExactKeys(value, "failure", ["code", "evidence"]);
  return {
    code: requireNonemptyString(readOwn(value, "code"), "failure.code"),
    evidence: requireNonemptyString(readOwn(value, "evidence"), "failure.evidence"),
  };
}
