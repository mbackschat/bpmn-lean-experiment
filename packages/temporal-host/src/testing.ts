/**
 * Test support: the ephemeral Temporal servers, the scenario runner bound to the TypeScript kernel, and a scenario's
 * recorded Script results (`withScriptResults`).
 */
import { kernelPort } from "./kernel-port.js";
import type { JsonValue } from "./port.js";
import { runScenarioThroughHost, type ScenarioHost } from "./scenario-runner.js";

export {
  createCachedLocalEnvironment,
  createCachedTimeSkippingEnvironment,
  temporalCliVersion,
  type CachedEnvironmentOptions,
} from "./ephemeral-server.js";
export type { ScenarioHost } from "./scenario-runner.js";
export { withScriptResults } from "./script-results.js";

/**
 * Drives `scenarioJson` on `programJson` (the kernel IL's wire form) through a host Worker serving `host.client`'s
 * task queue, and returns the canonical scenario result.
 */
export function runScenario(programJson: JsonValue, scenarioJson: JsonValue, host: ScenarioHost): Promise<JsonValue> {
  return runScenarioThroughHost(kernelPort, host, programJson, scenarioJson);
}
