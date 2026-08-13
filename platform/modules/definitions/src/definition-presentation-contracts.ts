import type { DeepReadonly } from "@bpmn-lean/contract-types";

export type GeneratedDiagramProvenance = DeepReadonly<{
  kind: "generated";
  generatorId: "bpmn-auto-layout";
  generatorVersion: "1.3.0";
  effectiveGeneratorSha256: string;
}>;

export type BpmnDiagramPresentationSidecar = DeepReadonly<{
  schemaEpoch: 1;
  sourceSha256: string;
  diagramInterchangeSha256: string;
  presentationSha256: string;
  provenance: GeneratedDiagramProvenance;
  diagramInterchangeXml: string;
}>;

export type DefinitionPresentationKey = DeepReadonly<{
  schemaEpoch: 1;
  sourceSha256: string;
  effectiveGeneratorSha256: string;
}>;

export interface DefinitionPresentationRepository {
  get(key: DefinitionPresentationKey): BpmnDiagramPresentationSidecar | null;
  insertOrCompare(
    sidecar: BpmnDiagramPresentationSidecar,
  ): BpmnDiagramPresentationSidecar;
}

/** Stored sidecar bytes or identity disagree with the exact selected durable record. */
export class DefinitionPresentationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefinitionPresentationIntegrityError";
  }
}
