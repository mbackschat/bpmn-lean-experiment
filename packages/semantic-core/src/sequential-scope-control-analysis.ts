import { analyzeParallelBodyBursts } from "./parallel-body-burst-analysis.js";
import { SemanticOperationKind as Op } from "./semantic-process-contract.js";
import type { SemanticProcessProgram } from "./semantic-process-contract.js";
import { semanticProcessClosureLimit } from "./semantic-process-limits.js";
import { SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID } from "./semantic-profile-catalog.js";
import { analyzeRepeatedScopeStructure } from "./repeated-scope-control-analysis.js";

export type SequentialScopeControlAnalysis = Readonly<{
  entryOperationId: string;
  childScopeId: string;
  maximumBurst: number;
}>;

/** SMIS-ADMIT-01 retains the sequential turnover bound independently of parallel population capacity. */
export function analyzeSequentialScopeControl(program: SemanticProcessProgram): SequentialScopeControlAnalysis | undefined {
  const structure = analyzeRepeatedScopeStructure(program, SEQUENTIAL_MULTI_INSTANCE_SUBPROCESS_CHECKPOINT_PROFILE_ID,
    Op.EnterSequentialMultiInstanceScope);
  if (structure === undefined) return undefined;
  const { parent, body, entryOperationId, childScopeId } = structure;
  const bursts = analyzeParallelBodyBursts(body);
  if (bursts === undefined) return undefined;
  const parentContinuation = parent.after > 0 ? 1 : 2;
  const entryResumption = 1 + Math.max(bursts.entryBurst, parentContinuation);
  // SMIS-END-01 retires and replaces a body in one operation; the next body settles in that same resumption.
  const maximumBurst = Math.max(parent.before > 0 ? 2 : 1 + entryResumption, entryResumption,
    bursts.maximumResumptionBurst, bursts.maximumTerminalBurst + 1 + Math.max(bursts.entryBurst, parentContinuation), 2);
  return maximumBurst <= semanticProcessClosureLimit ? { entryOperationId, childScopeId, maximumBurst } : undefined;
}
