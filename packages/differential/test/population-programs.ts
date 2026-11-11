/**
 * The programs a population's deployments run (docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#deployments,
 * PC-SCOPE-03): each definition is read once, and each deployment's program is `assembleProgram` over every deployment
 * whose source the reader accepted, so a deployment carries the other deployments' processes its Calls name and
 * `Kernel.Population.deploy` decides which of them it may bind. A deployment whose source the reader refuses deploys as
 * refused and contributes no process; it still takes its ordinal, which assembly's stamps and renames use.
 */
import { assembleProgram } from "@bpmn-lean/bpmn-source";
import type { AssemblyDeployment, KernelJson, KernelRead } from "@bpmn-lean/bpmn-source";

import { readSourceFor } from "./scenario-discovery.ts";
import type { PopulationScenarioDocument } from "./scenario-discovery.ts";

const deployed = (step: unknown): string | null => {
  const { kind, definitionRef } = step as Readonly<{ kind?: unknown; definitionRef?: unknown }>;
  return kind === "deploy" && typeof definitionRef === "string" ? definitionRef : null;
};

/**
 * The definition each deploy ordinal deploys, from 1, as `Kernel.Population` numbers them: the definitions no `deploy`
 * step names, in list order, then every `deploy` step in step order. A step naming no declared definition keeps its
 * ordinal, since the kernels refuse it as `population-unknown-definition`.
 */
export function deploymentOrder(definitionRefs: readonly string[], steps: readonly unknown[]): string[] {
  const named = steps.flatMap((step) => {
    const definitionRef = deployed(step);
    return definitionRef === null ? [] : [definitionRef];
  });
  return [...definitionRefs.filter((definitionRef) => !named.includes(definitionRef)), ...named];
}

/**
 * The deployment sources `runPopulation` and `kernelRun --population` take, one per deployment in deploy order: the
 * program assembled for it over the population's accepted reads, or `{"refused": code}` for a source the reader
 * refused. A `deploy` step naming no declared definition has none, since the kernels refuse it before they need one.
 * `bytes` replaces a definition's retained source, by its `definitionRef`, which its `sha256` must then bind.
 */
export async function populationPrograms(scenarioPath: string, document: PopulationScenarioDocument,
  bytes: ReadonlyMap<string, Uint8Array> = new Map()): Promise<KernelJson[]> {
  const reads = new Map<string, KernelRead>();
  for (const definition of document.definitions) {
    reads.set(definition.definitionRef,
      await readSourceFor(scenarioPath, definition.bpmn, document.profile, bytes.get(definition.definitionRef)));
  }
  const order = deploymentOrder(document.definitions.map((definition) => definition.definitionRef), document.steps);
  const accepted: AssemblyDeployment[] = order.flatMap((definitionRef, index) => {
    const read = reads.get(definitionRef);
    return read?.kind === "read" ? [{ deploymentId: index + 1, program: read.program, versionTag: read.versionTag }] : [];
  });
  return order.flatMap((definitionRef, index): KernelJson[] => {
    const read = reads.get(definitionRef);
    if (read === undefined) return [];
    return [read.kind === "read" ? assembleProgram(accepted, index + 1) : { refused: read.code }];
  });
}
