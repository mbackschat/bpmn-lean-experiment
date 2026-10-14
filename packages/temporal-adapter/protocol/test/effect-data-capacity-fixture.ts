/**
 * The retained credit-decision model, derived variants and a maximal admitted Start for the effect-data
 * capacity-envelope tests of every Temporal package, so the layers measure the same journeys.
 *
 * Variants edit the retained bytes rather than author a second model: one widens Assess to more reserved outputs,
 * the other appends Service Tasks that reuse the Notify handler, so batch count grows while each state stays small.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { SemanticProfileId, StimulusKind, VariableValueKind } from "@bpmn-lean/semantic-core";
import type { SemanticProcessProgram, StartProcessStimulus } from "@bpmn-lean/semantic-core";

const directory = new URL("../../../../scenarios/portable-business-effect-data/", import.meta.url);

/** The longest Start String the profile admits (`PBV-EFF-01`). */
export const longestApplicant = "a".repeat(1_024);

export async function creditDecisionProgram(
  edit: (source: string) => string = (source) => source,
): Promise<SemanticProcessProgram> {
  const overlay = await readFile(new URL("source-overlay.json", directory));
  const compiled = await compileBpmnToSemanticProcess({
    bytes: new TextEncoder().encode(edit(await readFile(new URL("credit-decision.bpmn", directory), "utf8"))),
    sourceId: "credit-decision-capacity",
    expectedSha256: undefined,
    sourceOverlay: { id: "credit-handlers", sha256: createHash("sha256").update(overlay).digest("hex"), bytes: overlay },
    semanticProfile: SemanticProfileId.PortableBusinessEffectData,
    limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
  });
  if (compiled.status !== BpmnCompilationStatus.Accepted) {
    throw new Error(`The credit-decision capacity model was refused: ${JSON.stringify(compiled)}`);
  }
  return compiled.semanticProcess;
}

/** Assess declares `count` further outputs, each reading its own local and writing its own Property. */
export function withExtraAssessOutputs(count: number): (source: string) => string {
  const outputs = Array.from({ length: count }, (_, index) =>
    `\n          <camunda:outputParameter name="extra${index}">\${extra${index}}</camunda:outputParameter>`).join("");
  return (source) => replaceOnce(source,
    `<camunda:outputParameter name="assessment">\${assessment}</camunda:outputParameter>`,
    `<camunda:outputParameter name="assessment">\${assessment}</camunda:outputParameter>${outputs}`);
}

/** `count` further Service Tasks follow Notify, each sending the applicant reference and writing nothing. */
export function withFollowUpNotifications(count: number): (source: string) => string {
  const ids = Array.from({ length: count }, (_, index) => `FollowUp${index}`);
  const tasks = ids.map((id) => `
    <serviceTask id="${id}" implementation="urn:bpmn-lean:effect-protocol:activity-v1"
                 camunda:delegateExpression="\${notifyApplicant}" camunda:asyncBefore="true">
      <extensionElements>
        <camunda:inputOutput>
          <camunda:inputParameter name="applicant">\${applicantRef}</camunda:inputParameter>
        </camunda:inputOutput>
      </extensionElements>
    </serviceTask>`).join("");
  const chain = ["NotifyApplicant", ...ids, "ApplicantNotified"];
  const flows = chain.slice(1).map((target, index) =>
    `\n    <sequenceFlow id="FollowUpFlow${index}" sourceRef="${chain[index]}" targetRef="${target}" />`).join("");
  return (source) => replaceOnce(
    replaceOnce(source, `\n    <sequenceFlow id="ToEnd" sourceRef="NotifyApplicant" targetRef="ApplicantNotified" />`, flows),
    `\n    <endEvent id="ApplicantNotified"`, `${tasks}\n    <endEvent id="ApplicantNotified"`,
  );
}

export function creditStart(
  instanceId: string,
  applicant = longestApplicant,
  commandId = "start-credit",
): StartProcessStimulus {
  return {
    kind: StimulusKind.StartProcess,
    commandId,
    processId: "Process_CreditDecision",
    instanceId,
    initialVariables: [{ name: "applicantRef", value: { kind: VariableValueKind.String, value: applicant } }],
  } as const satisfies StartProcessStimulus;
}

function replaceOnce(source: string, search: string, replacement: string): string {
  const at = source.indexOf(search);
  if (at < 0 || source.indexOf(search, at + 1) >= 0) throw new Error(`Expected exactly one ${search}`);
  return source.slice(0, at) + replacement + source.slice(at + search.length);
}
