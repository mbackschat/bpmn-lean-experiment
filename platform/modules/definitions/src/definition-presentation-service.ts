import { createHash } from "node:crypto";

import type {
  BpmnPresentationAdapter,
} from "@bpmn-lean/platform-bpmn-definition-projection";
import type {
  ResolvedBpmnDiagramPresentation,
} from "@bpmn-lean/platform-contracts";

import {
  DefinitionArtifactIntegrityError,
} from "./contracts.js";
import type {
  DefinitionReference,
  DefinitionRepository,
  ExactArtifactStore,
} from "./contracts.js";
import {
  DefinitionPresentationIntegrityError,
} from "./definition-presentation-contracts.js";
import type {
  BpmnDiagramPresentationSidecar,
  DefinitionPresentationRepository,
} from "./definition-presentation-contracts.js";
import { toPublicDefinition } from "./definition-public-values.js";

export type DefinitionPresentationServiceDependencies = Readonly<{
  definitions: DefinitionRepository;
  artifacts: ExactArtifactStore;
  presentations: DefinitionPresentationRepository;
  adapter: BpmnPresentationAdapter;
  maxSourceBytes: number;
  generationDeadlineMs: number;
}>;

/** Resolves exact source DI or one digest-bound generated sidecar for a definition. */
export class DefinitionPresentationService {
  readonly #dependencies: DefinitionPresentationServiceDependencies;

  constructor(dependencies: DefinitionPresentationServiceDependencies) {
    requirePositiveSafeInteger(dependencies.maxSourceBytes, "maxSourceBytes");
    requirePositiveSafeInteger(
      dependencies.generationDeadlineMs,
      "generationDeadlineMs",
    );
    this.#dependencies = { ...dependencies };
  }

  async resolve(
    reference: DefinitionReference,
  ): Promise<ResolvedBpmnDiagramPresentation | null> {
    const definition = await this.#dependencies.definitions.get(reference);
    if (definition === null) return null;
    const bytes = await this.#dependencies.artifacts.get(definition.source.sha256);
    if (bytes === null || bytes.byteLength !== definition.source.byteLength) {
      throw new DefinitionArtifactIntegrityError(
        reference,
        definition.source.sha256,
        bytes === null ? null : {
          expected: definition.source.byteLength,
          actual: bytes.byteLength,
        },
      );
    }
    if (bytes.byteLength > this.#dependencies.maxSourceBytes) {
      throw new DefinitionPresentationIntegrityError(
        "stored definition source exceeds the presentation byte ceiling",
      );
    }
    const exactBytes = bytes.slice();
    if (sha256(exactBytes) !== definition.source.sha256) {
      throw new DefinitionPresentationIntegrityError(
        "stored definition source digest does not match its admitted identity",
      );
    }
    const sourceXml = decodeUtf8(exactBytes);
    if (sha256Text(sourceXml) !== definition.source.sha256) {
      throw new DefinitionPresentationIntegrityError(
        "decoded definition source does not preserve its exact admitted UTF-8 bytes",
      );
    }
    const sourceResolution = await this.#dependencies.adapter.resolveSourceDiagram(
      sourceXml,
      definition.processId,
    );
    switch (sourceResolution.kind) {
      case "source":
        return {
          schemaEpoch: 1,
          definition: toPublicDefinition(definition),
          sourceSha256: definition.source.sha256,
          presentationSha256: definition.source.sha256,
          provenance: { kind: "source" },
          presentationBpmnXml: sourceXml,
        };
      case "unusable":
        throw new DefinitionPresentationIntegrityError(
          `source BPMN DI is unusable: ${sourceResolution.evidence}`,
        );
      case "absent":
        return await this.#resolveGenerated(definition, sourceXml);
    }
  }

  async #resolveGenerated(
    definition: NonNullable<Awaited<ReturnType<DefinitionRepository["get"]>>>,
    sourceXml: string,
  ): Promise<ResolvedBpmnDiagramPresentation> {
    const key = {
      schemaEpoch: 1 as const,
      sourceSha256: definition.source.sha256,
      effectiveGeneratorSha256:
        this.#dependencies.adapter.effectiveGeneratorSha256,
    };
    const retained = await this.#dependencies.presentations.get(key);
    const sidecar = retained ?? await this.#generateSidecar(
      definition.processId,
      definition.source.sha256,
      sourceXml,
    );
    requireSidecarBinding(sidecar, key.sourceSha256, key.effectiveGeneratorSha256);
    const presentationBpmnXml = await this.#dependencies.adapter
      .validateGeneratedComposition(
        sourceXml,
        definition.processId,
        sidecar.diagramInterchangeXml,
      );
    requireExactSourceComposition(
      sourceXml,
      sidecar.diagramInterchangeXml,
      presentationBpmnXml,
    );
    if (sha256Text(presentationBpmnXml) !== sidecar.presentationSha256) {
      throw new DefinitionPresentationIntegrityError(
        "retained presentation digest does not match the exact composed XML",
      );
    }
    return {
      schemaEpoch: 1,
      definition: toPublicDefinition(definition),
      sourceSha256: definition.source.sha256,
      presentationSha256: sidecar.presentationSha256,
      provenance: { ...sidecar.provenance },
      presentationBpmnXml,
    };
  }

  async #generateSidecar(
    processId: string,
    sourceSha256: string,
    sourceXml: string,
  ): Promise<BpmnDiagramPresentationSidecar> {
    const generated = await this.#dependencies.adapter.generate(
      sourceXml,
      processId,
      { deadlineMs: this.#dependencies.generationDeadlineMs },
    );
    if (
      generated.provenance.effectiveGeneratorSha256 !==
        this.#dependencies.adapter.effectiveGeneratorSha256 ||
      sha256Text(generated.diagramInterchangeXml) !==
        generated.diagramInterchangeSha256
    ) {
      throw new DefinitionPresentationIntegrityError(
        "generated DI does not match its selected generator binding",
      );
    }
    const presentationBpmnXml = await this.#dependencies.adapter
      .validateGeneratedComposition(
        sourceXml,
        processId,
        generated.diagramInterchangeXml,
      );
    requireExactSourceComposition(
      sourceXml,
      generated.diagramInterchangeXml,
      presentationBpmnXml,
    );
    const candidate = {
      schemaEpoch: 1 as const,
      sourceSha256,
      diagramInterchangeSha256: generated.diagramInterchangeSha256,
      presentationSha256: sha256Text(presentationBpmnXml),
      provenance: { ...generated.provenance },
      diagramInterchangeXml: generated.diagramInterchangeXml,
    };
    return await this.#dependencies.presentations.insertOrCompare(candidate);
  }
}

function requireSidecarBinding(
  sidecar: BpmnDiagramPresentationSidecar,
  sourceSha256: string,
  effectiveGeneratorSha256: string,
): void {
  if (
    sidecar.schemaEpoch !== 1 ||
    sidecar.sourceSha256 !== sourceSha256 ||
    sidecar.provenance.kind !== "generated" ||
    sidecar.provenance.generatorId !== "bpmn-auto-layout" ||
    sidecar.provenance.generatorVersion !== "1.3.0" ||
    sidecar.provenance.effectiveGeneratorSha256 !== effectiveGeneratorSha256 ||
    sha256Text(sidecar.diagramInterchangeXml) !== sidecar.diagramInterchangeSha256
  ) {
    throw new DefinitionPresentationIntegrityError(
      "retained presentation sidecar does not match its durable key or DI digest",
    );
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error: unknown) {
    throw new DefinitionPresentationIntegrityError(
      `stored definition source is not exact UTF-8: ${errorMessage(error)}`,
    );
  }
}

function requireExactSourceComposition(
  sourceXml: string,
  diagramInterchangeXml: string,
  presentationBpmnXml: string,
): void {
  if (
    presentationBpmnXml.length === sourceXml.length + diagramInterchangeXml.length &&
    hasSingleExactInsertion(sourceXml, diagramInterchangeXml, presentationBpmnXml)
  ) {
    return;
  }
  throw new DefinitionPresentationIntegrityError(
    "generated BPMN presentation does not preserve the exact admitted source bytes",
  );
}

function hasSingleExactInsertion(
  source: string,
  insertion: string,
  composition: string,
): boolean {
  let insertionAt = composition.indexOf(insertion);
  while (insertionAt >= 0) {
    if (
      composition.slice(0, insertionAt) === source.slice(0, insertionAt) &&
      composition.slice(insertionAt + insertion.length) === source.slice(insertionAt)
    ) {
      return true;
    }
    insertionAt = composition.indexOf(insertion, insertionAt + 1);
  }
  return false;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown UTF-8 failure";
}
