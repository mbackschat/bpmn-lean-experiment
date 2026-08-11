import metamodelManifest from "./bpmn-2.0.2-semantic-process-metamodel.json" with {
  type: "json",
};
import { asElement } from "./moddle-graph.js";
import type { ElementRecord } from "./moddle-graph.js";

type ContainmentCardinalityMismatch = Readonly<{
  property: string;
  sourceOccurrences: number;
  projectedOccurrences: number;
  expectedOccurrences: number | null;
}>;

export type ExactContainmentCardinality = Readonly<{
  property: string;
  projectedType: string;
  xmlLocalName: string;
  expectedOccurrences: number;
}>;

type SingletonContainmentSpec = Readonly<{
  ownerType: string;
  property: string;
  xmlLocalName: string;
}>;

/**
 * Preserves exact containment cardinalities before raw BPMN source is discarded.
 *
 * The parser exposes neither the discarded value nor a warning, so comparing its projected owner
 * properties with the exact XML element occurrences is the only way to preserve the manifest's
 * upper bound before the raw source is discarded. Selected source checkpoints can additionally
 * require an exact occurrence count for repeatable containments. This is a cardinality check, not
 * a second BPMN parser: `bpmn-moddle` still owns namespaces, structure, values, and references.
 */
export function firstContainmentCardinalityMismatch(
  xml: string,
  elements: ReadonlyMap<ElementRecord, unknown>,
  exactCardinalities: ReadonlyArray<ExactContainmentCardinality> = [],
): ContainmentCardinalityMismatch | undefined {
  const searchableXml = removeOpaqueXmlRegions(xml);
  for (const property of metamodelManifest.properties) {
    if (!property.containment || property.upper !== 1) {
      continue;
    }
    const spec = singletonContainmentSpec(property.owner, property.name);
    if (spec === undefined) {
      return {
        property: `${property.owner}.${property.name}`,
        sourceOccurrences: -1,
        projectedOccurrences: -1,
        expectedOccurrences: null,
      };
    }
    const sourceOccurrences = countOpeningElements(
      searchableXml,
      spec.xmlLocalName,
    );
    const projectedOccurrences = [...elements.keys()].filter(
      (element) =>
        element.$type === spec.ownerType &&
        asElement(element[spec.property]) !== undefined,
    ).length;
    if (sourceOccurrences !== projectedOccurrences) {
      return {
        property: `${property.owner}.${property.name}`,
        sourceOccurrences,
        projectedOccurrences,
        expectedOccurrences: null,
      };
    }
  }
  for (const cardinality of exactCardinalities) {
    const sourceOccurrences = countOpeningElements(
      searchableXml,
      cardinality.xmlLocalName,
    );
    const projectedOccurrences = [...elements.keys()].filter(
      ({ $type }) => $type === cardinality.projectedType,
    ).length;
    if (
      sourceOccurrences !== cardinality.expectedOccurrences ||
      projectedOccurrences !== cardinality.expectedOccurrences
    ) {
      return {
        property: cardinality.property,
        sourceOccurrences,
        projectedOccurrences,
        expectedOccurrences: cardinality.expectedOccurrences,
      };
    }
  }
  return undefined;
}

function singletonContainmentSpec(
  owner: string,
  property: string,
): SingletonContainmentSpec | undefined {
  switch (`${owner}.${property}`) {
    case "SequenceFlow.conditionExpression":
      return {
        ownerType: metamodelManifest.compilerProjection.sequenceFlowType,
        property,
        xmlLocalName: property,
      };
    case "TimerEventDefinition.timeDuration":
      return {
        ownerType: metamodelManifest.compilerProjection.timerEventDefinitionType,
        property,
        xmlLocalName: property,
      };
    default:
      return undefined;
  }
}

function countOpeningElements(xml: string, localName: string): number {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const opening = new RegExp(
    `<(?:[^\\s<>/:]+:)?${escaped}(?=[\\s/>])`,
    "gu",
  );
  return [...xml.matchAll(opening)].length;
}

function removeOpaqueXmlRegions(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, "")
    .replace(/<\?[\s\S]*?\?>/gu, "");
}
