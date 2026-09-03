import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type { AcceptedBpmnCompilation } from "@bpmn-lean/bpmn-source";
import {
  EnginePopulationPublicationOutcomeKind,
  runEnginePopulationScenario,
} from "@bpmn-lean/semantic-core";
import type {
  EnginePopulationScenario,
  EnginePopulationScenarioResult,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  projectRoot,
  readJson,
} from "./pipeline-target-support.ts";

export type MessageKeyCorrelationPopulationCase = Readonly<{
  id: string;
  scenarioRelativePath: string;
  expectedOutcome:
    typeof EnginePopulationPublicationOutcomeKind[
      keyof typeof EnginePopulationPublicationOutcomeKind
    ];
}>;

export type MessageKeyCorrelationPopulationContext = Readonly<{
  populationCase: MessageKeyCorrelationPopulationCase;
  scenario: EnginePopulationScenario;
  definitions: ReadonlyArray<Readonly<{
    checkedProcess: AcceptedBpmnCompilation["checkedProcess"];
    semanticProcess: SemanticProcessProgram;
  }>>;
  programsByDefinitionId: ReadonlyMap<string, SemanticProcessProgram>;
}>;

export const messageKeyCorrelationPopulationCases = Object.freeze([
  {
    id: "message-key-correlation-ambiguous",
    scenarioRelativePath:
      "scenarios/message-key-correlation/ambiguous.population-scenario.json",
    expectedOutcome:
      EnginePopulationPublicationOutcomeKind.RejectedAmbiguous,
  },
  {
    id: "message-key-correlation-cross-definition",
    scenarioRelativePath:
      "scenarios/message-key-correlation/cross-definition.population-scenario.json",
    expectedOutcome: EnginePopulationPublicationOutcomeKind.Committed,
  },
  {
    id: "message-key-correlation-unique",
    scenarioRelativePath:
      "scenarios/message-key-correlation/unique.population-scenario.json",
    expectedOutcome: EnginePopulationPublicationOutcomeKind.Committed,
  },
  {
    id: "message-key-correlation-zero",
    scenarioRelativePath:
      "scenarios/message-key-correlation/zero.population-scenario.json",
    expectedOutcome: EnginePopulationPublicationOutcomeKind.RejectedNoMatch,
  },
] as const satisfies ReadonlyArray<MessageKeyCorrelationPopulationCase>);

/** Compiles every exact definition named by the separate population input. */
export async function loadMessageKeyCorrelationPopulationCases(): Promise<
  ReadonlyArray<MessageKeyCorrelationPopulationContext>
> {
  return Promise.all(messageKeyCorrelationPopulationCases.map(async (
    populationCase,
  ) => {
    const scenario = await readJson<EnginePopulationScenario>(
      path.join(projectRoot, populationCase.scenarioRelativePath),
    );
    if (scenario.id !== populationCase.id) {
      throw new TypeError(
        `Population case ${populationCase.id} does not match scenario ${scenario.id}`,
      );
    }
    const compiled = await Promise.all(scenario.definitions.map(async (
      definition,
    ) => {
      if (definition.sourceOverlay !== null) {
        throw new TypeError(
          `Population definition ${definition.id} selects an unsupported source overlay`,
        );
      }
      const bytes = await readFile(path.join(projectRoot, definition.relativePath));
      const result = await compileBpmnToSemanticProcess({
        bytes,
        sourceId: definition.id,
        expectedSha256: definition.sha256,
        sourceOverlay: null,
        semanticProfile: scenario.profile,
        limits: {
          maxBytes: 1024 * 1024,
          parserDeadlineMs: 1_000,
        },
      });
      if (result.status !== BpmnCompilationStatus.Accepted) {
        throw new TypeError(
          `Population definition ${definition.id} was rejected: ${JSON.stringify(result.diagnostics)}`,
        );
      }
      return {
        definitionId: definition.id,
        checkedProcess: result.checkedProcess,
        semanticProcess: result.semanticProcess,
      };
    }));
    return {
      populationCase,
      scenario,
      definitions: compiled,
      programsByDefinitionId: new Map(compiled.map((definition) => [
        definition.definitionId,
        definition.semanticProcess,
      ])),
    };
  }));
}

export function runMessageKeyCorrelationPopulationCore(
  contexts: ReadonlyArray<MessageKeyCorrelationPopulationContext>,
): ReadonlyMap<string, EnginePopulationScenarioResult> {
  const results = new Map<string, EnginePopulationScenarioResult>();
  for (const context of contexts) {
    const result = runEnginePopulationScenario(
      context.scenario,
      context.programsByDefinitionId,
    );
    if (result === null) {
      throw new TypeError(
        `Semantic core refused population scenario ${context.scenario.id}`,
      );
    }
    results.set(context.scenario.id, result);
  }
  return results;
}
