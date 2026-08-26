import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { Connection } from "@temporalio/client";
import { createTemporalWorkflowClient } from "@bpmn-lean/temporal-client";

import { prepareGuidedDemo } from "./demo-preparation.ts";
import { guidedDemoPlan } from "./demo-plan.ts";
import { GuidedDemoPlatformApi } from "./platform-api.ts";
import { GuidedDemoTemporalActor } from "./temporal-actor.ts";

const platformOrigin = readOrigin("GUIDED_DEMO_PLATFORM_ORIGIN");
const temporalAddress = readRequired("BPMN_TEMPORAL_ADDRESS");
const temporalNamespace = readRequired("BPMN_TEMPORAL_NAMESPACE");
const scenarioRoot = readAbsolutePath("GUIDED_DEMO_SCENARIO_ROOT");

const connection = await Connection.connect({ address: temporalAddress });
try {
  const api = new GuidedDemoPlatformApi(platformOrigin);
  const actor = new GuidedDemoTemporalActor(createTemporalWorkflowClient({
    connection,
    namespace: temporalNamespace,
  }));
  const prepared = await prepareGuidedDemo(guidedDemoPlan, {
    readSource: async (sourceFile) => new Uint8Array(
      await readFile(join(scenarioRoot, sourceFile)),
    ),
    deploy: async (entry, bytes) => api.deploy(entry, bytes),
    start: async (entry, definition) => api.start(entry, definition),
    drive: async (entry, instance) => actor.drive(entry, instance),
    waitForAudienceState: async (state) => api.waitForAudienceState(state),
  });
  process.stdout.write(`${JSON.stringify({
    status: "ready",
    audienceUrl: `${platformOrigin}/?audience=demo`,
    scenarios: prepared.map(({ scenario, instance }) => ({
      scenario,
      processInstanceId: instance.processInstanceId,
      sourceId: instance.definition.source.id,
    })),
  })}\n`);
} catch (failure: unknown) {
  const message = failure instanceof Error ? failure.message : String(failure);
  process.stderr.write(`Guided demo preparation failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await connection.close();
}

function readRequired(name: string): string {
  const value = process.env[name];
  if (
    value === undefined ||
    value.length === 0 ||
    value.trim() !== value ||
    !value.isWellFormed()
  ) {
    throw new TypeError(`${name} must be an exact well-formed nonempty string`);
  }
  return value;
}

function readOrigin(name: string): string {
  const value = new URL(readRequired(name));
  if (value.protocol !== "http:" && value.protocol !== "https:") {
    throw new TypeError(`${name} must use HTTP or HTTPS`);
  }
  if (value.pathname !== "/" || value.search !== "" || value.hash !== "") {
    throw new TypeError(`${name} must contain only an origin`);
  }
  return value.origin;
}

function readAbsolutePath(name: string): string {
  const value = readRequired(name);
  if (!isAbsolute(value)) throw new TypeError(`${name} must be an absolute path`);
  return value;
}
