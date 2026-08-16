import {
  decodeHumanTaskCatalogV1,
} from "@bpmn-lean/platform-contracts";
import type {
  HumanTaskCatalogBindingIdentityV1,
  HumanTaskCatalogV1,
  HumanTaskDefinitionV1,
  PublicProcessInstanceIdentity,
} from "@bpmn-lean/platform-contracts";

/** Narrow Product 2 port for one immutable source-bound catalog. */
export interface HumanTaskCatalogReader {
  readHumanTaskCatalog(
    identity: HumanTaskCatalogBindingIdentityV1,
  ): HumanTaskCatalogV1 | null;
}

export type BoundHumanTaskDefinitionV1 = Readonly<{
  catalogIdentity: HumanTaskCatalogBindingIdentityV1;
  taskDefinition: HumanTaskDefinitionV1;
}>;

export function catalogIdentityFor(
  instance: PublicProcessInstanceIdentity,
): HumanTaskCatalogBindingIdentityV1 {
  return {
    processId: instance.definition.processId,
    version: instance.definition.version,
    sourceSha256: instance.definition.source.sha256,
    semanticProfile: instance.definition.semanticProfile,
  };
}

/** Missing, corrupt, mismatched, or element-incomplete catalogs fail closed. */
export function readBoundHumanTaskDefinition(
  reader: HumanTaskCatalogReader,
  instance: PublicProcessInstanceIdentity,
  elementId: string,
): BoundHumanTaskDefinitionV1 | null {
  const catalogIdentity = catalogIdentityFor(instance);
  return readBoundHumanTaskDefinitionByIdentity(reader, catalogIdentity, elementId);
}

export function readBoundHumanTaskDefinitionByIdentity(
  reader: HumanTaskCatalogReader,
  catalogIdentity: HumanTaskCatalogBindingIdentityV1,
  elementId: string,
): BoundHumanTaskDefinitionV1 | null {
  let catalog: HumanTaskCatalogV1;
  try {
    const candidate = reader.readHumanTaskCatalog(catalogIdentity);
    if (candidate === null) return null;
    catalog = decodeHumanTaskCatalogV1(structuredClone(candidate));
  } catch {
    return null;
  }
  if (
    catalog.processId !== catalogIdentity.processId ||
    catalog.sourceSha256 !== catalogIdentity.sourceSha256 ||
    catalog.semanticProfile !== catalogIdentity.semanticProfile
  ) {
    return null;
  }
  const taskDefinition = catalog.tasks.find((task) => task.elementId === elementId);
  return taskDefinition === undefined
    ? null
    : { catalogIdentity, taskDefinition };
}
