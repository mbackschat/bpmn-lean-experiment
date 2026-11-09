/**
 * Drives one scenario through the host and returns the kernel runner's canonical result shape
 * (`Kernel.Run.result`), so a differential target can compare the hosted run with the kernel's own.
 *
 * The chain runs under `Scheduling.External`: timer firings and effect results are the scenario's explicit inputs.
 * Trace rules follow `Kernel.Run.execute`: a committed input, or a rejected one that is not last, adds its command
 * and the state observation and the run continues; any other outcome adds them and ends the run. Each verdict comes
 * from the host, except an input before any instance exists, which the kernel judges with no state, as the host has
 * no Workflow to send it to.
 */
import type { ProcessClient } from "./client.js";
import { assertNever } from "./host-machine.js";
import { Route, type DefinitionRef, type JsonValue, type KernelPort } from "./port.js";
import { Scheduling, type CommandResult, type HostConfig } from "./protocol.js";

export interface ScenarioHost {
  readonly client: ProcessClient;
  /** Prefix of the Workflow IDs this run starts; one per start attempt until an instance exists. */
  readonly workflowIdPrefix: string;
}

interface Scenario {
  readonly definition: DefinitionRef;
  readonly stimuli: readonly JsonValue[];
}

function field(json: JsonValue, key: string): JsonValue {
  if (json === null || typeof json !== "object" || Array.isArray(json) || !(key in json)) {
    throw new TypeError(`scenario: missing ${key}`);
  }
  return (json as { readonly [name: string]: JsonValue })[key] ?? null;
}

function text(json: JsonValue, key: string): string {
  const value = field(json, key);
  if (typeof value !== "string") throw new TypeError(`scenario: ${key} is not a string`);
  return value;
}

/** The deployment reference `Kernel.Run.definitionRefFromJson` reads from a scenario's BPMN resource. */
function readScenario(json: JsonValue): Scenario {
  const bpmn = field(json, "bpmn");
  const overlay = field(bpmn, "sourceOverlay");
  const stimuli = field(json, "stimuli");
  if (!Array.isArray(stimuli)) throw new TypeError("scenario: stimuli is not an array");
  return {
    definition: {
      sourceId: text(bpmn, "id"),
      sourceSha256: text(bpmn, "sha256"),
      sourceOverlay: overlay === null ? null : { id: text(overlay, "id"), sha256: text(overlay, "sha256") },
      profile: text(json, "profile"),
    },
    stimuli,
  };
}

const semantic = (outcome: string): JsonValue => ({ kind: "semantic", outcome });
const command = (commandId: string, outcome: string): JsonValue => ({ kind: "command", commandId, outcome });

export async function runScenarioThroughHost<P, S, I>(
  port: KernelPort<P, S, I>,
  host: ScenarioHost,
  programJson: JsonValue,
  scenarioJson: JsonValue,
): Promise<JsonValue> {
  const program = port.decodeProgram(programJson);
  const refusal = port.admit(program);
  if (refusal !== null) {
    return { outcome: semantic("unsupported"), trace: [{ kind: "deployment", outcome: "unsupported", code: refusal }] };
  }
  const scenario = readScenario(scenarioJson);
  const config: HostConfig = {
    scheduling: Scheduling.External,
    definition: scenario.definition,
    effectStartToCloseMs: 60_000,
    historyEventBudget: null,
  };
  const trace: JsonValue[] = [{ kind: "deployment", outcome: "committed" }];
  let instance: string | null = null;
  let attempts = 0;

  const submit = async (stimulus: JsonValue, input: I): Promise<CommandResult> => {
    const route = port.route(input);
    if (route === Route.Start && instance === null) {
      attempts += 1;
      const workflowId = `${host.workflowIdPrefix}-${String(attempts)}`;
      const result = await host.client.start({ workflowId, program: programJson, config, start: stimulus });
      if (result.outcome === "committed") instance = workflowId;
      return result;
    }
    if (instance === null) {
      const verdict = port.step(program, null, input);
      return verdict.committed
        ? { outcome: "committed", code: null, revision: null }
        : { outcome: verdict.outcome, code: verdict.code, revision: null };
    }
    switch (route) {
      case Route.Start:
        return host.client.start({ workflowId: instance, program: programJson, config, start: stimulus });
      case Route.Command: return host.client.command(instance, stimulus);
      case Route.Deliver: return host.client.deliver(instance, stimulus);
      case Route.TimerFire: return host.client.timerFire(instance, stimulus);
      case Route.EffectResult: return host.client.effectResult(instance, stimulus);
    }
    return assertNever(route);
  };

  const observation = async (): Promise<JsonValue[]> => {
    if (instance === null) return [];
    const observed = await host.client.observation(instance);
    return observed === null ? [] : [observed];
  };

  for (const [index, stimulus] of scenario.stimuli.entries()) {
    const { commandId, input } = port.decodeStimulus(stimulus);
    const result: CommandResult = input === null
      // `Kernel.Run.execute` reports a stimulus the kernel does not accept as unsupported.
      ? { outcome: "unsupported", code: "stimulus", revision: null }
      : await submit(stimulus, input);
    trace.push(command(commandId, result.outcome), ...await observation());
    const last = index === scenario.stimuli.length - 1;
    if (result.outcome === "committed" || (result.outcome === "rejected" && !last)) continue;
    return { outcome: semantic(result.outcome), trace };
  }
  return { outcome: semantic("committed"), trace };
}
