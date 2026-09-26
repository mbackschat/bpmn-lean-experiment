import type { DeployedDefinitionVersion } from "@bpmn-lean/platform-contracts";
import type { ProcessShowcaseEntry } from "../../../../model-corpus/rc-showcases.ts";

declare const __BPMN_PROCESS_SHOWCASES__: ReadonlyArray<ProcessShowcaseEntry>;

export const processShowcaseCatalog: ReadonlyArray<ProcessShowcaseEntry> =
  typeof __BPMN_PROCESS_SHOWCASES__ === "undefined" ? [] : __BPMN_PROCESS_SHOWCASES__;

/** Presets belong to exact admitted bytes and profile, never a matching Process name. */
export function findProcessShowcase(
  definition: DeployedDefinitionVersion,
  entries: ReadonlyArray<ProcessShowcaseEntry> = processShowcaseCatalog,
): ProcessShowcaseEntry | null {
  return entries.find((entry) => entry.sha256 === definition.source.sha256
    && entry.profile === definition.semanticProfile && entry.showcase !== null) ?? null;
}
