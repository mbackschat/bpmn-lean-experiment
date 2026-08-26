import type {
  DeployedDefinitionVersion,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

import type { DemoPlanEntry, DemoScenario } from "./demo-plan.ts";

export type PreparedDemoScenario = Readonly<{
  scenario: DemoScenario;
  instance: PublicProcessInstanceIdentity;
}>;

export type GuidedDemoPreparationPort = Readonly<{
  readSource(sourceFile: DemoPlanEntry["sourceFile"]): Promise<Uint8Array>;
  deploy(entry: DemoPlanEntry, bytes: Uint8Array): Promise<DeployedDefinitionVersion>;
  start(
    entry: DemoPlanEntry,
    definition: DeployedDefinitionVersion,
  ): Promise<PublicProcessInstanceIdentity>;
  drive(entry: DemoPlanEntry, instance: PublicProcessInstanceIdentity): Promise<void>;
  waitForAudienceState(prepared: ReadonlyArray<PreparedDemoScenario>): Promise<void>;
}>;

/** Builds the complete audience state before advertising readiness. */
export async function prepareGuidedDemo(
  plan: ReadonlyArray<DemoPlanEntry>,
  port: GuidedDemoPreparationPort,
): Promise<ReadonlyArray<PreparedDemoScenario>> {
  const sourceBytes = new Map<DemoPlanEntry["sourceFile"], Uint8Array>();
  const prepared: PreparedDemoScenario[] = [];
  for (const entry of plan) {
    let bytes = sourceBytes.get(entry.sourceFile);
    if (bytes === undefined) {
      bytes = (await port.readSource(entry.sourceFile)).slice();
      sourceBytes.set(entry.sourceFile, bytes);
    }
    const definition = await port.deploy(entry, bytes.slice());
    const instance = await port.start(entry, definition);
    if (entry.responses.length > 0) {
      await port.drive(entry, instance);
    }
    prepared.push({ scenario: entry.scenario, instance });
  }
  await port.waitForAudienceState(prepared);
  return prepared;
}
