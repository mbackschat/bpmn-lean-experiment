import { createHash } from "node:crypto";

import { BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256 } from "./generator-identity.js";
import { runLayoutWorker } from "./layout-worker-client.js";
import {
  findProcess,
  inventoryProcess,
  parsePresentationModel,
  validateDiagramCoverage,
  validateGenerationScope,
} from "./presentation-model.js";
import {
  composePresentationXml,
  extractSelfContainedDiagram,
  sourceContainsBpmnDiagram,
} from "./xml-boundary.js";

export { BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256 } from "./generator-identity.js";

export type SourceDiagramResolution =
  | Readonly<{ kind: "source" }>
  | Readonly<{ kind: "absent" }>
  | Readonly<{ kind: "unusable"; evidence: string }>;

export type GeneratedDiagramInterchange = Readonly<{
  diagramInterchangeXml: string;
  diagramInterchangeSha256: string;
  provenance: Readonly<{
    kind: "generated";
    generatorId: "bpmn-auto-layout";
    generatorVersion: "1.3.0";
    effectiveGeneratorSha256: string;
  }>;
}>;

export type BpmnPresentationGenerationOptions = Readonly<{
  deadlineMs?: number;
}>;

export interface BpmnPresentationAdapter {
  readonly effectiveGeneratorSha256: string;

  resolveSourceDiagram(
    sourceXml: string,
    processId: string,
  ): Promise<SourceDiagramResolution>;

  generate(
    sourceXml: string,
    processId: string,
    options?: BpmnPresentationGenerationOptions,
  ): Promise<GeneratedDiagramInterchange>;

  validateGeneratedComposition(
    sourceXml: string,
    processId: string,
    diagramInterchangeXml: string,
  ): Promise<string>;
}

const MAXIMUM_SOURCE_BYTES = 1_048_576;
const MAXIMUM_LAYOUT_OUTPUT_BYTES = 4_194_304;
const MAXIMUM_DIAGRAM_INTERCHANGE_BYTES = 2_097_152;

/** Product 2-only DI adapter. It never returns a generated BPMN model or mutates source bytes. */
export class BpmnAutoLayoutPresentationAdapter implements BpmnPresentationAdapter {
  get effectiveGeneratorSha256(): string {
    return BPMN_AUTO_LAYOUT_EFFECTIVE_GENERATOR_SHA256;
  }

  async resolveSourceDiagram(
    sourceXml: string,
    processId: string,
  ): Promise<SourceDiagramResolution> {
    assertBoundedUtf8(sourceXml, MAXIMUM_SOURCE_BYTES, "BPMN source");
    const hasSourceDiagram = sourceContainsBpmnDiagram(sourceXml);
    let model: Awaited<ReturnType<typeof parsePresentationModel>>;
    try {
      model = await parsePresentationModel(sourceXml, "BPMN source");
    } catch (cause: unknown) {
      if (hasSourceDiagram) {
        const evidence = cause instanceof Error ? cause.message : "source DI is invalid";
        return Object.freeze({ kind: "unusable", evidence });
      }
      throw cause;
    }
    const inventory = inventoryProcess(findProcess(model.definitions, processId));
    if (!hasSourceDiagram) {
      return Object.freeze({ kind: "absent" });
    }
    const evidence = validateDiagramCoverage(model, inventory);
    return evidence === null
      ? Object.freeze({ kind: "source" })
      : Object.freeze({ kind: "unusable", evidence });
  }

  async generate(
    sourceXml: string,
    processId: string,
    options?: BpmnPresentationGenerationOptions,
  ): Promise<GeneratedDiagramInterchange> {
    const deadlineMs = options?.deadlineMs;
    assertBoundedUtf8(sourceXml, MAXIMUM_SOURCE_BYTES, "BPMN source");
    const model = await parsePresentationModel(sourceXml, "BPMN source");
    const inventory = inventoryProcess(findProcess(model.definitions, processId));
    validateGenerationScope(model.definitions, inventory);

    const sourceDiagram = await this.resolveSourceDiagram(sourceXml, processId);
    switch (sourceDiagram.kind) {
      case "source":
        throw new Error("source BPMN DI is already usable");
      case "unusable":
        throw new Error(`source BPMN DI is unusable: ${sourceDiagram.evidence}`);
      case "absent":
        break;
    }

    const generatedXml = await runLayoutWorker(
      sourceXml,
      deadlineMs,
      MAXIMUM_LAYOUT_OUTPUT_BYTES,
    );
    const generatedModel = await parsePresentationModel(
      generatedXml,
      "generated layout",
    );
    findProcess(generatedModel.definitions, processId);
    const coverageFailure = validateDiagramCoverage(
      generatedModel,
      inventory,
      model,
      true,
    );
    if (coverageFailure !== null) {
      throw new Error(`generated BPMN DI is incomplete: ${coverageFailure}`);
    }
    const diagramInterchangeXml = extractSelfContainedDiagram(generatedXml);
    assertBoundedUtf8(
      diagramInterchangeXml,
      MAXIMUM_DIAGRAM_INTERCHANGE_BYTES,
      "generated BPMN DI",
    );
    await this.validateGeneratedComposition(
      sourceXml,
      processId,
      diagramInterchangeXml,
    );

    const provenance = Object.freeze({
      kind: "generated" as const,
      generatorId: "bpmn-auto-layout" as const,
      generatorVersion: "1.3.0" as const,
      effectiveGeneratorSha256: this.effectiveGeneratorSha256,
    });
    return Object.freeze({
      diagramInterchangeXml,
      diagramInterchangeSha256: sha256(diagramInterchangeXml),
      provenance,
    });
  }

  async validateGeneratedComposition(
    sourceXml: string,
    processId: string,
    diagramInterchangeXml: string,
  ): Promise<string> {
    assertBoundedUtf8(sourceXml, MAXIMUM_SOURCE_BYTES, "BPMN source");
    assertBoundedUtf8(
      diagramInterchangeXml,
      MAXIMUM_DIAGRAM_INTERCHANGE_BYTES,
      "generated BPMN DI",
    );
    const sourceModel = await parsePresentationModel(sourceXml, "BPMN source");
    if ((sourceModel.definitions.diagrams ?? []).length > 0) {
      throw new Error("generated BPMN DI may compose only with source that has no DI");
    }
    findProcess(sourceModel.definitions, processId);

    const presentationXml = composePresentationXml(sourceXml, diagramInterchangeXml);
    const composedModel = await parsePresentationModel(
      presentationXml,
      "composed BPMN presentation",
    );
    const inventory = inventoryProcess(findProcess(composedModel.definitions, processId));
    const coverageFailure = validateDiagramCoverage(
      composedModel,
      inventory,
      composedModel,
      true,
    );
    if (coverageFailure !== null) {
      throw new Error(`generated BPMN DI is incomplete: ${coverageFailure}`);
    }
    return presentationXml;
  }
}

function assertBoundedUtf8(value: string, limit: number, boundary: string): void {
  if (Buffer.byteLength(value, "utf8") > limit) {
    throw new Error(`${boundary} exceeds the byte limit`);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
