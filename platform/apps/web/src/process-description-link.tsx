import { Link } from "@tanstack/react-router";
import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";

import type { DefinitionSearch } from "./navigation/route-search.ts";
import { findProcessShowcase } from "./process-showcase-catalog.ts";
import styles from "./process-description-link.module.css";

export function ProcessDescriptionLink({ definition, search = {} }: Readonly<{
  definition: DeployedDefinitionVersion;
  search?: DefinitionSearch;
}>) {
  const model = findProcessShowcase(definition);
  if (model === null) return null;
  return <Link className={styles.link} to="/definitions" search={{
    ...search, process: definition.processId, version: definition.version,
    view: "showcases", model: model.id,
  }}>Process description</Link>;
}
