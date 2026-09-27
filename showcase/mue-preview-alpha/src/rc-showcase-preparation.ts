import { DefinitionDeployStatus, decodeDefinitionDeployResult, definitionsCollectionPath } from "@bpmn-lean/platform-contracts";
import type { ProcessShowcaseEntry } from "../../../model-corpus/rc-showcases.ts";

/** Prepares the curated demo through ordinary admission; starting remains a user command. */
export async function prepareRcShowcases(
  origin: string,
  entries: readonly ProcessShowcaseEntry[],
  fetcher: typeof fetch = fetch,
): Promise<void> {
  for (const model of entries) {
    if (model.showcase === null) continue;
    const url = new URL(definitionsCollectionPath(), origin);
    url.searchParams.set("sourceId", model.sourcePath.split("/").at(-1)!);
    url.searchParams.set("semanticProfile", model.profile);
    const response = await fetcher(url, {
      method: "POST", headers: { "content-type": "application/bpmn+xml", accept: "application/json" },
      body: new TextEncoder().encode(model.xml), signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 201 && response.status !== 422) {
      throw new Error(`RC showcase ${model.id} preparation returned HTTP ${response.status}`);
    }
    const result = decodeDefinitionDeployResult(await response.json());
    switch (result.status) {
      case DefinitionDeployStatus.Rejected:
        throw new Error(`RC showcase ${model.id} preparation rejected: ${result.diagnostics.map(({ code }) => code).join(", ")}`);
      case DefinitionDeployStatus.Deployed:
        if (response.status !== 201) throw new Error(`RC showcase ${model.id} preparation has a contradictory HTTP status`);
        if (result.definition.source.sha256 !== model.sha256 || result.definition.semanticProfile !== model.profile) {
          throw new Error(`RC showcase ${model.id} preparation returned a different source or profile`);
        }
        break;
    }
  }
}
