/**
 * The executable model corpus as the kernel inspects it: the discovered scenarios, the kernel's own admission of every
 * model and scenario source with the catalog variants each admitted program exercises (`programCapabilities`), and the
 * inspection that both the corpus guard (`executable-model-corpus.test.ts`) and the renderer (`render-corpus-map.ts`)
 * run, so the rendered map and retained-model capability list are by construction what the guard compares.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { programCapabilities } from "../../packages/differential/test/kernel-capabilities.ts";
import {
  kernelAdmission, kernelAdmittedProgram, kernelStimulusDecoding, readCaseSource,
} from "../../packages/differential/test/kernel-program.ts";
import {
  DiscoveredKind,
  discoverScenarios,
  readSourceFor,
} from "../../packages/differential/test/scenario-discovery.ts";
import type { DiscoveredScenario, SourceDefinition } from "../../packages/differential/test/scenario-discovery.ts";
import {
  inspectExecutableModelCorpus,
  renderExecutableModelCorpusMap,
  renderRetainedModelCapabilities,
  requireExecutableModelCorpusManifest,
  retainedModelCapabilitiesRelativePath,
} from "../../scripts/executable-model-corpus.ts";
import type {
  CorpusAdmission,
  CorpusAdmitter,
  CorpusScenario,
  CorpusSourceAdmitter,
  ExecutableModelCorpusManifest,
} from "../../scripts/executable-model-corpus.ts";
import { externalRoot } from "../../scripts/external-root.ts";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = path.join(projectRoot, "model-corpus/manifest.json");
export const corpusMapPath = path.join(projectRoot, "model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md");
export const capabilityListPath = path.join(projectRoot, retainedModelCapabilitiesRelativePath);

export async function loadManifest(): Promise<unknown> {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export const discovered = await discoverScenarios();

function corpusScenario(scenario: DiscoveredScenario): CorpusScenario {
  switch (scenario.kind) {
    case DiscoveredKind.Scenario:
      return {
        id: scenario.document.id,
        relativePath: scenario.relativePath,
        kind: scenario.kind,
        profile: scenario.document.profile,
        sources: [scenario.document.bpmn],
        stimuli: scenario.document.stimuli,
        retainedEvidenceVersion: scenario.evidence?.engineVersion ?? null,
      };
    case DiscoveredKind.PopulationScenario:
      return {
        id: scenario.document.id,
        relativePath: scenario.relativePath,
        kind: scenario.kind,
        profile: scenario.document.profile,
        sources: scenario.document.definitions.map(({ bpmn }) => bpmn),
        stimuli: [],
        retainedEvidenceVersion: null,
      };
  }
}

export const scenarios = discovered.map(corpusScenario);

/** The kernel's decision on one read, with the catalog variants the admitted program exercises. */
function corpusAdmission(read: Parameters<typeof kernelAdmittedProgram>[0]): CorpusAdmission {
  const admitted = kernelAdmittedProgram(read);
  return admitted.status === "accepted" ? { status: "accepted", capabilities: () => programCapabilities(admitted.program) } : admitted;
}

/**
 * Retained models read through the differential's own source path, bound overlay included; external ones bare, and
 * their programs unclassified, as an external candidate claims nothing.
 */
const admitModel: CorpusAdmitter = async (model, bytes, scenario) => {
  if (scenario === null) {
    const admission = kernelAdmission(await readCaseSource(
      { relativePath: model.id, bytes, sha256: model.source.sha256, overlay: null }, model.profile));
    return admission.status === "accepted" ? { status: "accepted", capabilities: () => [] } : admission;
  }
  const found = discovered.find(({ relativePath }) => relativePath === scenario.relativePath);
  assert.ok(found !== undefined);
  const sources = found.kind === DiscoveredKind.Scenario
    ? [found.document.bpmn]
    : found.document.definitions.map(({ bpmn }) => bpmn);
  const source = sources.find(({ relativePath }) =>
    model.source.kind === "retainedScenario" && relativePath === model.source.bpmnRelativePath);
  assert.ok(source !== undefined);
  return corpusAdmission(await readSourceFor(found.relativePath, source, found.document.profile));
};

/** Every discovered source by what admission reads: its profile, bytes and the overlay and decisions it binds. */
const sourceDefinitions = new Map<string, { found: DiscoveredScenario; definition: SourceDefinition }>(discovered.flatMap((found) =>
  (found.kind === DiscoveredKind.Scenario ? [found.document.bpmn] : found.document.definitions.map(({ bpmn }) => bpmn))
    .map((definition): [string, { found: DiscoveredScenario; definition: SourceDefinition }] =>
      [`${found.document.profile}\0${definition.relativePath}\0${definition.sha256}`, { found, definition }])));
const sourceAdmissions = new Map<string, Promise<CorpusAdmission>>();

/** The kernel's admission of one scenario source under the scenario's profile, once per distinct source. */
export const admitSource: CorpusSourceAdmitter = (scenario, source) => {
  const key = `${scenario.profile}\0${source.relativePath}\0${source.sha256}`;
  const known = sourceDefinitions.get(key);
  assert.ok(known !== undefined, `${scenario.relativePath} binds no discovered source ${source.relativePath}`);
  const identity = `${key}\0${known.definition.sourceOverlay?.sha256 ?? ""}\0${(known.definition.decisions ?? []).map(({ sha256 }) => sha256).join(",")}`;
  const admission = sourceAdmissions.get(identity) ??
    readSourceFor(known.found.relativePath, known.definition, known.found.document.profile).then(corpusAdmission);
  sourceAdmissions.set(identity, admission);
  return admission;
};

export const inspect = (
  manifest: ExecutableModelCorpusManifest,
  selected: ReadonlyArray<CorpusScenario> = scenarios,
  admit: CorpusSourceAdmitter = admitSource,
) => inspectExecutableModelCorpus(manifest, {
  projectRoot, externalRoot, scenarios: selected, admitModel, admitSource: admit, decodeStimulus: kernelStimulusDecoding,
});

/**
 * The generated files the manifest and the discovered scenarios imply, by path: the corpus map and the retained-model
 * capability list. The guard compares each with the committed file and the renderer writes it.
 */
export async function renderCorpusFiles(): Promise<ReadonlyArray<readonly [string, string]>> {
  const report = await inspect(requireExecutableModelCorpusManifest(await loadManifest()));
  return [[corpusMapPath, renderExecutableModelCorpusMap(report)], [capabilityListPath, renderRetainedModelCapabilities(report)]];
}
