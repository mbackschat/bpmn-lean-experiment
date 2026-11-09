/**
 * Drives one scenario through the host and returns the kernel runner's canonical result shape
 * (`Kernel.Run.result`), so a differential target can compare the hosted run with the kernel's own.
 *
 * The chain runs under `Scheduling.External`: timer firings and effect results are the scenario's explicit inputs.
 * Trace rules follow `Kernel.Run.execute`: a committed input, or a rejected one that is not last, adds its command
 * and the state observation and the run continues; any other outcome adds them and ends the run; a command that did
 * not commit carries its code. Each verdict comes from the host, except where the host has no Workflow to send an input
 * to: before any instance exists the kernel judges it with no state, and after the chain ended it judges it from the
 * chain's final state, so a late input carries the kernel's code and never the host's closed-chain one.
 */
import type { ProcessClient } from "./client.js";
import { workflowClosed } from "./host-contract.js";
import { assertNever } from "./host-machine.js";
import { Route, type JsonValue, type KernelPort } from "./port.js";
import { Scheduling, type CommandResult, type HostConfig } from "./protocol.js";

/** The client calls a scenario run makes. */
export type ScenarioClient = Pick<
  ProcessClient,
  "start" | "command" | "deliver" | "timerFire" | "effectResult" | "observation" | "state"
>;

export interface ScenarioHost {
  readonly client: ScenarioClient;
  /** Prefix of the Workflow IDs this run starts; one per start attempt until an instance exists. */
  readonly workflowIdPrefix: string;
}

/** The scenario's stimuli, which `Kernel.Run.run` reads. */
function readStimuli(json: JsonValue): readonly JsonValue[] {
  const stimuli = json !== null && typeof json === "object" && !Array.isArray(json)
    ? (json as { readonly [name: string]: JsonValue })["stimuli"]
    : null;
  if (!Array.isArray(stimuli)) throw new TypeError("scenario: stimuli is not an array");
  return stimuli;
}

const semantic = (outcome: string): JsonValue => ({ kind: "semantic", outcome });
const command = (commandId: string, result: CommandResult): JsonValue => result.code === null
  ? { kind: "command", commandId, outcome: result.outcome }
  : { kind: "command", commandId, outcome: result.outcome, code: result.code };

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
  const stimuli = readStimuli(scenarioJson);
  const config: HostConfig = {
    scheduling: Scheduling.External,
    effectStartToCloseMs: 60_000,
    historyEventBudget: null,
  };
  const trace: JsonValue[] = [{ kind: "deployment", outcome: "committed" }];
  let instance: string | null = null;
  let attempts = 0;

  const judged = (before: S | null, input: I): CommandResult => {
    const verdict = port.step(program, before, input);
    return verdict.committed
      ? { outcome: "committed", code: null, revision: null }
      : { outcome: verdict.outcome, code: verdict.code, revision: null };
  };

  const hosted = async (workflowId: string, stimulus: JsonValue, route: Route): Promise<CommandResult> => {
    switch (route) {
      case Route.Start:
        return host.client.start({ workflowId, program: programJson, config, start: stimulus });
      case Route.Command: return host.client.command(workflowId, stimulus);
      case Route.Deliver: return host.client.deliver(workflowId, stimulus);
      case Route.TimerFire: return host.client.timerFire(workflowId, stimulus);
      case Route.EffectResult: return host.client.effectResult(workflowId, stimulus);
    }
    return assertNever(route);
  };

  const submit = async (stimulus: JsonValue, input: I): Promise<CommandResult> => {
    const route = port.route(input);
    if (route === Route.Start && instance === null) {
      attempts += 1;
      const workflowId = `${host.workflowIdPrefix}-${String(attempts)}`;
      const result = await host.client.start({ workflowId, program: programJson, config, start: stimulus });
      if (result.outcome === "committed") instance = workflowId;
      return result;
    }
    if (instance === null) return judged(null, input);
    const result = await hosted(instance, stimulus, route);
    if (result.outcome !== "rejected" || result.code !== workflowClosed) return result;
    const final = await host.client.state(instance);
    return final === null ? result : judged(port.decodeState(final), input);
  };

  const observation = async (): Promise<JsonValue[]> => {
    if (instance === null) return [];
    const observed = await host.client.observation(instance);
    return observed === null ? [] : [observed];
  };

  for (const [index, stimulus] of stimuli.entries()) {
    const { commandId, input } = port.decodeStimulus(stimulus);
    const result = await submit(stimulus, input);
    trace.push(command(commandId, result), ...await observation());
    const last = index === stimuli.length - 1;
    if (result.outcome === "committed" || (result.outcome === "rejected" && !last)) continue;
    return { outcome: semantic(result.outcome), trace };
  }
  return { outcome: semantic("committed"), trace };
}
