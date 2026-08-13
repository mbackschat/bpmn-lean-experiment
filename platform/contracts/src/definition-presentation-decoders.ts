import { decodeDeployedDefinitionVersion } from "./deployed-definition-decoder.js";
import {
  DefinitionPresentationProvenanceKind,
} from "./definition-presentation.js";
import type {
  DefinitionPresentationProvenance,
  GeneratedDiagramPresentationProvenance,
  ResolvedBpmnDiagramPresentation,
} from "./definition-presentation.js";
import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireObject,
  requireString,
} from "./decoder-primitives.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;

/** Decodes a resolved presentation and refuses unknown fields at every public level. */
export function decodeResolvedBpmnDiagramPresentation(
  value: unknown,
): ResolvedBpmnDiagramPresentation {
  requireObject(value, "definition presentation");
  requireExactKeys(value, "definition presentation", [
    "definition",
    "presentationBpmnXml",
    "presentationSha256",
    "provenance",
    "schemaEpoch",
    "sourceSha256",
  ]);
  const schemaEpoch = readOwn(value, "schemaEpoch");
  if (schemaEpoch !== 1) {
    throw new TypeError("definition presentation.schemaEpoch must be 1");
  }
  return {
    schemaEpoch,
    definition: decodeDeployedDefinitionVersion(
      readOwn(value, "definition"),
      "definition",
    ),
    sourceSha256: decodeSha256(
      readOwn(value, "sourceSha256"),
      "definition presentation.sourceSha256",
    ),
    presentationSha256: decodeSha256(
      readOwn(value, "presentationSha256"),
      "definition presentation.presentationSha256",
    ),
    provenance: decodeDefinitionPresentationProvenance(
      readOwn(value, "provenance"),
    ),
    presentationBpmnXml: requireNonemptyString(
      readOwn(value, "presentationBpmnXml"),
      "definition presentation.presentationBpmnXml",
    ),
  };
}

export function decodeDefinitionPresentationProvenance(
  value: unknown,
): DefinitionPresentationProvenance {
  requireObject(value, "provenance");
  const kind = readOwn(value, "kind");
  switch (kind) {
    case DefinitionPresentationProvenanceKind.Source:
      requireExactKeys(value, "provenance", ["kind"]);
      return { kind };
    case DefinitionPresentationProvenanceKind.Generated:
      return decodeGeneratedProvenance(value);
    default:
      throw new TypeError("provenance.kind must be source or generated");
  }
}

function decodeGeneratedProvenance(
  value: object,
): GeneratedDiagramPresentationProvenance {
  requireExactKeys(value, "provenance", [
    "effectiveGeneratorSha256",
    "generatorId",
    "generatorVersion",
    "kind",
  ]);
  const generatorId = readOwn(value, "generatorId");
  if (generatorId !== "bpmn-auto-layout") {
    throw new TypeError("provenance.generatorId must be bpmn-auto-layout");
  }
  const generatorVersion = readOwn(value, "generatorVersion");
  if (generatorVersion !== "1.3.0") {
    throw new TypeError("provenance.generatorVersion must be 1.3.0");
  }
  return {
    kind: DefinitionPresentationProvenanceKind.Generated,
    generatorId,
    generatorVersion,
    effectiveGeneratorSha256: decodeSha256(
      readOwn(value, "effectiveGeneratorSha256"),
      "provenance.effectiveGeneratorSha256",
    ),
  };
}

function decodeSha256(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!lowercaseSha256.test(digest)) {
    throw new TypeError(`${label} must be a lowercase SHA-256 digest`);
  }
  return digest;
}
