import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bpmnSourceUrl = new URL(
  "../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);

export const retryProfile = "cibseven-2.2.0-service-task-incident-draft";
export const cancellationProfile =
  "cibseven-2.2.0-service-task-incident-cancellation-draft";
export const exactSourceSha256 =
  "669083696c1706836fcaa487f7f5623408f658fb721145a8111a8b00b7fd7c7d";
export const effectElementId = "ServiceTask_Record";

export async function exactIncidentBpmnSource(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(bpmnSourceUrl));
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
