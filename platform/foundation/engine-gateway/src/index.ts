/** Product 2's only entry into the BPMN engine contract. */
import {
  EngineDefinitionCompilationStatus,
  compileBpmnDefinition,
} from "@bpmn-lean/engine-api";
import type {
  EngineDefinitionCompilationResult,
} from "@bpmn-lean/engine-api";

export const DefinitionCompilationStatus = EngineDefinitionCompilationStatus;

export type DefinitionCompilationResult = EngineDefinitionCompilationResult;

export type DefinitionCompilationRequest = Readonly<{
  bytes: Uint8Array;
  sourceId: string;
  semanticProfile: string;
  expectedSha256: string | undefined;
}>;

export type EngineGatewayLimits = Readonly<{
  maxSourceBytes: number;
  parserDeadlineMs: number;
}>;

export interface DefinitionCompiler {
  compileDefinition(
    request: DefinitionCompilationRequest,
  ): Promise<DefinitionCompilationResult>;
}

export class BpmnEngineGateway implements DefinitionCompiler {
  private readonly limits: EngineGatewayLimits;

  constructor(limits: EngineGatewayLimits) {
    requirePositiveSafeInteger(limits.maxSourceBytes, "maxSourceBytes");
    requirePositiveSafeInteger(limits.parserDeadlineMs, "parserDeadlineMs");
    this.limits = { ...limits };
  }

  compileDefinition(
    request: DefinitionCompilationRequest,
  ): Promise<DefinitionCompilationResult> {
    return compileBpmnDefinition({
      ...request,
      limits: {
        maxBytes: this.limits.maxSourceBytes,
        parserDeadlineMs: this.limits.parserDeadlineMs,
      },
    });
  }
}

function requirePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}
