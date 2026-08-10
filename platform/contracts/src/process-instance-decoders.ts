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
  const instance = readOwn(value, "instance");
  requireObject(instance, "instance");
  requireExactKeys(instance, "instance", ["definition", "processInstanceId"]);
  return {
    status: ProcessInstanceStartStatus.Started,
    instance: {
      processInstanceId: requireNonemptyString(
        readOwn(instance, "processInstanceId"),
        "instance.processInstanceId",
      ),
      definition: decodeDeployedDefinitionVersion(
        readOwn(instance, "definition"),
        "definition",
      ),
    },
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
