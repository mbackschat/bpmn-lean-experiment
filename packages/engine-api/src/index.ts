/**
 * Narrow product-facing engine entry point.
 *
 * It projects admission identity and diagnostics while keeping the checked graph and Semantic
 * Process program inside product 1. Additional start, observation, and command operations join this
 * same entry point as their M1 consumers land.
 */
import {
  BpmnCompilationStatus,
  compileBpmnToSemanticProcess,
} from "@bpmn-lean/bpmn-source";
import type {
  BpmnSourceDiagnostic,
  BpmnSourceIdentity,
  BpmnSourceLimits,
} from "@bpmn-lean/bpmn-source";
import type { DeepReadonly } from "@bpmn-lean/semantic-core";

export const EngineDefinitionCompilationStatus = {
  Accepted: "accepted",
  Rejected: "rejected",
} as const;

export type EngineDefinitionCompilationStatus =
  typeof EngineDefinitionCompilationStatus[
    keyof typeof EngineDefinitionCompilationStatus
  ];

/** Compilation snapshots the mutable byte view before asynchronous parsing. */
export type EngineDefinitionCompilationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
  expectedSha256: string | undefined;
  limits: BpmnSourceLimits;
}>;

export type EngineDefinitionIdentity = DeepReadonly<{
  processId: string;
  semanticProfile: string;
}>;

export type EngineAcceptedDefinitionCompilation = DeepReadonly<{
  status: typeof EngineDefinitionCompilationStatus.Accepted;
  source: BpmnSourceIdentity;
  diagnostics: readonly [];
  definition: EngineDefinitionIdentity;
}>;

export type EngineRejectedDefinitionCompilation = DeepReadonly<{
  status: typeof EngineDefinitionCompilationStatus.Rejected;
  source: BpmnSourceIdentity;
  diagnostics: BpmnSourceDiagnostic[];
  definition: undefined;
}>;

export type EngineDefinitionCompilationResult =
  | EngineAcceptedDefinitionCompilation
  | EngineRejectedDefinitionCompilation;

export async function compileBpmnDefinition(
  request: EngineDefinitionCompilationRequest,
): Promise<EngineDefinitionCompilationResult> {
  if (!(request.bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
  const snapshot = {
    bytes: Uint8Array.from(request.bytes),
    sourceId: request.sourceId,
    semanticProfile: request.semanticProfile,
    expectedSha256: request.expectedSha256,
    limits: { ...request.limits },
  };
  const compilation = await compileBpmnToSemanticProcess({
    bytes: snapshot.bytes,
    sourceId: snapshot.sourceId,
    expectedSha256: snapshot.expectedSha256,
    semanticProfile: snapshot.semanticProfile,
    sourceOverlay: null,
    limits: snapshot.limits,
  });
  switch (compilation.status) {
    case BpmnCompilationStatus.Accepted:
      return {
        status: EngineDefinitionCompilationStatus.Accepted,
        source: compilation.source,
        diagnostics: [],
        definition: {
          processId: compilation.semanticProcess.processId,
          semanticProfile: compilation.semanticProcess.identity.semanticProfile,
        },
      };
    case BpmnCompilationStatus.Rejected:
      return {
        status: EngineDefinitionCompilationStatus.Rejected,
        source: compilation.source,
        diagnostics: compilation.diagnostics,
        definition: undefined,
      };
    default:
      return assertNever(compilation);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported BPMN compilation result: ${String(value)}`);
}

export * from "./definition-start.js";
