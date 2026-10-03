import { CallDataKind } from "./call-data-contract.js";
import type { CallDataInterface, ScalarIoSpecification } from "./call-data-contract.js";
import { activityDataInputSourceId, activityDataOutputTargetId, isActivityDataInputSource, isActivityDataOutputTarget } from "./activity-data-endpoint.js";
import { isWellFormedWireString } from "./wire.js";

/** Decodes the closed declaration shape; owner and correspondence checks remain contextual. */
export function isCallDataInterface(value: unknown): value is CallDataInterface {
  if (!record(value)) return false;
  switch (value.kind) {
    case CallDataKind.Empty: return keys(value, ["kind"]);
    case CallDataKind.Scalar:
      return keys(value, ["kind", "callerProperties", "call", "called", "directInput", "directOutput"]) &&
        strings(value.callerProperties) && scalarIo(value.call) && scalarIo(value.called) &&
        record(value.directInput) && keys(value.directInput,
          ["associationId", "source", "targetDataInputId", "targetDataInputName"]) &&
        identity(value.directInput.associationId) && isActivityDataInputSource(value.directInput.source) &&
        identity(value.directInput.targetDataInputId) && name(value.directInput.targetDataInputName) &&
        record(value.directOutput) && keys(value.directOutput,
          ["associationId", "sourceDataOutputId", "sourceDataOutputName", "target"]) &&
        identity(value.directOutput.associationId) && identity(value.directOutput.sourceDataOutputId) &&
        name(value.directOutput.sourceDataOutputName) && isActivityDataOutputTarget(value.directOutput.target);
    default: return false;
  }
}

/** Exact declaration equality binds invocation and return to the same checked source facts. */
export function sameCallDataInterface(left: CallDataInterface, right: CallDataInterface): boolean {
  switch (left.kind) {
    case CallDataKind.Empty: return right.kind === CallDataKind.Empty;
    case CallDataKind.Scalar:
      return right.kind === CallDataKind.Scalar && sameStrings(left.callerProperties, right.callerProperties) &&
        sameIo(left.call, right.call) && sameIo(left.called, right.called) &&
        left.directInput.associationId === right.directInput.associationId &&
        left.directInput.source.kind === right.directInput.source.kind &&
        activityDataInputSourceId(left.directInput.source) === activityDataInputSourceId(right.directInput.source) &&
        left.directInput.targetDataInputId === right.directInput.targetDataInputId &&
        left.directInput.targetDataInputName === right.directInput.targetDataInputName &&
        left.directOutput.associationId === right.directOutput.associationId &&
        left.directOutput.sourceDataOutputId === right.directOutput.sourceDataOutputId &&
        left.directOutput.sourceDataOutputName === right.directOutput.sourceDataOutputName &&
        left.directOutput.target.kind === right.directOutput.target.kind &&
        activityDataOutputTargetId(left.directOutput.target) === activityDataOutputTargetId(right.directOutput.target);
  }
}

/** Checks correspondence and caller-local associations under CDATA-MATCH-01. */
export function callDataInterfaceValid(
  data: CallDataInterface,
  callId: string,
  calledProcessId: string,
): boolean {
  switch (data.kind) {
    case CallDataKind.Empty:
      return true;
    case CallDataKind.Scalar: {
      const callerProperties = data.callerProperties;
      if (data.call.ownerId !== callId || data.called.ownerId !== calledProcessId ||
          !setsMatchPorts(data.call) || !setsMatchPorts(data.called) ||
          data.directInput.source.kind !== "property" ||
          data.directOutput.target.kind !== "property") return false;
      const source = data.directInput.source.propertyId;
      const target = data.directOutput.target.propertyId;
      const ids = [...callerProperties, ...interfaceIds(data.call), ...interfaceIds(data.called),
        data.directInput.associationId, data.directOutput.associationId];
      return source !== target && callerProperties.includes(source) && callerProperties.includes(target) &&
        data.directInput.targetDataInputId === data.call.input.id &&
        data.directOutput.sourceDataOutputId === data.call.output.id &&
        ids.every((id) => id.length > 0) && new Set(ids).size === ids.length;
    }
  }
}

function setsMatchPorts(io: ScalarIoSpecification): boolean {
  return io.inputSet.dataInputRefs.length === 1 && io.inputSet.dataInputRefs[0] === io.input.id &&
    io.outputSet.dataOutputRefs.length === 1 && io.outputSet.dataOutputRefs[0] === io.output.id;
}

function interfaceIds(io: ScalarIoSpecification): ReadonlyArray<string> {
  return [io.ownerId, io.id, io.input.id, io.output.id, io.inputSet.id, io.outputSet.id];
}

function sameIo(left: ScalarIoSpecification, right: ScalarIoSpecification): boolean {
  return sameStrings(interfaceIds(left), interfaceIds(right)) &&
    left.input.name === right.input.name && left.output.name === right.output.name &&
    left.inputSet.name === right.inputSet.name && left.outputSet.name === right.outputSet.name &&
    sameStrings(left.inputSet.dataInputRefs, right.inputSet.dataInputRefs) &&
    sameStrings(left.outputSet.dataOutputRefs, right.outputSet.dataOutputRefs);
}

function sameStrings(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function scalarIo(value: unknown): value is ScalarIoSpecification {
  return record(value) && keys(value, ["ownerId", "id", "input", "output", "inputSet", "outputSet"]) &&
    identity(value.ownerId) && identity(value.id) && port(value.input) && port(value.output) &&
    record(value.inputSet) && keys(value.inputSet, ["id", "name", "dataInputRefs"]) &&
    identity(value.inputSet.id) && name(value.inputSet.name) && strings(value.inputSet.dataInputRefs) &&
    record(value.outputSet) && keys(value.outputSet, ["id", "name", "dataOutputRefs"]) &&
    identity(value.outputSet.id) && name(value.outputSet.name) && strings(value.outputSet.dataOutputRefs);
}

function port(value: unknown): boolean {
  return record(value) && keys(value, ["id", "name"]) && identity(value.id) && name(value.name);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  return Object.keys(value).length === expected.length && Object.keys(value).every((key) => expected.includes(key));
}

function identity(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}

function name(value: unknown): boolean {
  return value === null || isWellFormedWireString(value);
}

function strings(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every(identity);
}
