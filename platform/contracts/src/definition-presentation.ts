import type { DeepReadonly } from "@bpmn-lean/contract-types";

import type { DeployedDefinitionVersion } from "./definitions.js";

export const DefinitionPresentationProvenanceKind = {
  Source: "source",
  Generated: "generated",
} as const;

export type DefinitionPresentationProvenanceKind =
  typeof DefinitionPresentationProvenanceKind[
    keyof typeof DefinitionPresentationProvenanceKind
  ];

export type SourceDiagramPresentationProvenance = DeepReadonly<{
  kind: typeof DefinitionPresentationProvenanceKind.Source;
}>;

export type GeneratedDiagramPresentationProvenance = DeepReadonly<{
  kind: typeof DefinitionPresentationProvenanceKind.Generated;
  generatorId: "bpmn-auto-layout";
  generatorVersion: "1.3.0";
  effectiveGeneratorSha256: string;
}>;

export type DefinitionPresentationProvenance =
  | SourceDiagramPresentationProvenance
  | GeneratedDiagramPresentationProvenance;

/** Exact public presentation resolved for one deployed definition version. */
export type ResolvedBpmnDiagramPresentation = DeepReadonly<{
  schemaEpoch: 1;
  definition: DeployedDefinitionVersion;
  sourceSha256: string;
  presentationSha256: string;
  provenance: DefinitionPresentationProvenance;
  presentationBpmnXml: string;
}>;
