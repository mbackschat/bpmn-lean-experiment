import type { DeepReadonly } from "./deep-readonly.js";
import type { VariableBinding } from "./contract.js";
import { readProcessInterfaceInput, writeProcessInterfaceOutput } from "./process-interface-data.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";
import { ControlStateKind } from "./semantic-process-state.js";
import type { RuntimeState, ScopedVariables, ScopeOccurrenceId } from "./semantic-process-state.js";
import { isWellFormedWireString } from "./wire.js";

export const ActivityDataEndpointKind = {
  Property: "property",
  ProcessDataInput: "processDataInput",
  ProcessDataOutput: "processDataOutput",
} as const;

export type ActivityDataInputSource = DeepReadonly<
  | { kind: typeof ActivityDataEndpointKind.Property; propertyId: string }
  | { kind: typeof ActivityDataEndpointKind.ProcessDataInput; dataInputId: string }
>;
export type ActivityDataOutputTarget = DeepReadonly<
  | { kind: typeof ActivityDataEndpointKind.Property; propertyId: string }
  | { kind: typeof ActivityDataEndpointKind.ProcessDataOutput; dataOutputId: string }
>;

export function isActivityDataInputSource(value: unknown): value is ActivityDataInputSource {
  if (!record(value)) return false;
  switch (value.kind) {
    case ActivityDataEndpointKind.Property: return exactEndpoint(value, "propertyId");
    case ActivityDataEndpointKind.ProcessDataInput: return exactEndpoint(value, "dataInputId");
    default: return false;
  }
}

export function isActivityDataOutputTarget(value: unknown): value is ActivityDataOutputTarget {
  if (!record(value)) return false;
  switch (value.kind) {
    case ActivityDataEndpointKind.Property: return exactEndpoint(value, "propertyId");
    case ActivityDataEndpointKind.ProcessDataOutput: return exactEndpoint(value, "dataOutputId");
    default: return false;
  }
}

export function activityDataInputSourceId(source: ActivityDataInputSource): string {
  switch (source.kind) {
    case ActivityDataEndpointKind.Property: return source.propertyId;
    case ActivityDataEndpointKind.ProcessDataInput: return source.dataInputId;
  }
}

export function activityDataOutputTargetId(target: ActivityDataOutputTarget): string {
  switch (target.kind) {
    case ActivityDataEndpointKind.Property: return target.propertyId;
    case ActivityDataEndpointKind.ProcessDataOutput: return target.dataOutputId;
  }
}

/** CDATA-OWNER-01 forbids a called task from treating its host's Property frame as its own. */
export function readActivityDataInputSource(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  source: ActivityDataInputSource,
): VariableBinding | undefined {
  if (state.control.kind !== ControlStateKind.Running) return undefined;
  switch (source.kind) {
    case ActivityDataEndpointKind.Property: {
      if (owner.processInstanceId !== state.control.instanceId) return undefined;
      const matching = state.variables.process.bindings.filter(({ name }) => name === source.propertyId);
      return matching.length === 1 ? matching[0] : undefined;
    }
    case ActivityDataEndpointKind.ProcessDataInput:
      return readProcessInterfaceInput(state.variables, owner, source.dataInputId);
  }
}

/** CDATA-OUTPUT-01 fills the owned target without changing the input snapshot or another frame. */
export function writeActivityDataOutputTarget(
  state: RuntimeState,
  owner: ScopeOccurrenceId,
  target: ActivityDataOutputTarget,
  filled: VariableBinding,
): ScopedVariables | null {
  if (state.control.kind !== ControlStateKind.Running) return null;
  switch (target.kind) {
    case ActivityDataEndpointKind.Property:
      if (owner.processInstanceId !== state.control.instanceId) return null;
      return {
        ...state.variables,
        process: { bindings: mergeProcessVariableBindings(state.variables.process.bindings,
          [{ name: target.propertyId, value: filled.value }]) },
      };
    case ActivityDataEndpointKind.ProcessDataOutput:
      return writeProcessInterfaceOutput(state.variables, owner, { name: target.dataOutputId, value: filled.value });
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactEndpoint(value: Record<string, unknown>, field: string): boolean {
  const identity = value[field];
  return Object.keys(value).length === 2 && Object.keys(value).every((key) => key === "kind" || key === field) &&
    isWellFormedWireString(identity) && identity.length > 0;
}
