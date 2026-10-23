/**
 * The repeated, nested and concurrent Calls census (docs/capsules/REPEATED-NESTED-CONCURRENT-CALLS-PROPOSAL.md,
 * "Representation and runtime ownership"): every executable TypeScript function and Lean definition that selects a
 * runtime occurrence by place, by definition scope alone, or by called definition, with the reason it stays sound once
 * a Program carries a Call forest. The site set is closed, so a new selector site fails here until it is classified.
 *
 * Categories:
 * - `placeOwner` selects the one token owner at a place and fails closed when two owners hold tokens there. CALLN-ONCE-01
 *   keeps one closure from creating two instances of a definition, serial called bodies leave every token of a live
 *   instance as a User Task wait at a stable state, and a completion resumes one instance, so no admitted closure puts
 *   two owners at one place.
 * - `callerScope` selects a Sub-Process occurrence by definition scope alone. Only the caller Process holds
 *   Sub-Processes and it is live once; called roots enter by `invokeProcess` and complete by `returnProcess`.
 * - `calledDefinitionData` reads called-root mappings by called definition. It answers only for the nested scope-data
 *   profile, and only Lean still selects so; Stage B's TypeScript side moved to `callRecordData`, and its Lean lift
 *   follows. The embedded completion profile carries no mappings.
 * - `callRecordData` reads a called root's mappings through the live record whose called root it is, so two Calls of
 *   one definition each see their own Call's data (CALLN-FRAME-01).
 * - `calledDefinitionKind` asks only whether every invocation of a called root carries mappings, a property of the
 *   called definition that no choice between two of its Calls changes.
 * - `outsideAlphabet` serves an operation or state family the embedded completion profile's Program alphabet excludes.
 * - `selectorDefinition` is a selector's own definition in terms of another.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { leanDeclarationPrefix } from "./lean-source-analysis.ts";

type Category = "placeOwner" | "callerScope" | "calledDefinitionData" | "callRecordData" | "calledDefinitionKind" |
  "outsideAlphabet" | "selectorDefinition";
type Site = readonly [file: string, definition: string, selector: string, category: Category];

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const byDefinitionScope = "byDefinitionScope";

const typeScriptSites: ReadonlyArray<Site> = [
  ["activity-data-operation-runtime.ts", "applyActivityDataOperation", "onlyTokenOwner", "outsideAlphabet"],
  ["compensation-activity-retention-state-validation.ts", "compensationRetentionStateDefects", byDefinitionScope, "outsideAlphabet"],
  ["compensation-event-sub-process-snapshot-state-validation.ts", "validRunningLifecycle", byDefinitionScope, "outsideAlphabet"],
  ["flow-node-occurrence-boundary-starts.ts", "candidateLongLivedStarts", byDefinitionScope, "outsideAlphabet"],
  ["flow-node-occurrence-boundary-starts.ts", "parallelScopeEntryStarts", byDefinitionScope, "outsideAlphabet"],
  ["flow-node-occurrence-parallel-scope.ts", "parallelScopeRetirementEnds", byDefinitionScope, "outsideAlphabet"],
  ["internal-transition-activity-arming-preparation.ts", "deriveInternalActivityArmingPreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-attempt.ts", "prepareCompensationSnapshotOperation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-bounded-scope-preparation.ts", "deriveInternalBoundedScopePreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-data-arming-preparation.ts", "deriveInternalDataArmingPreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-end-preparation.ts", "deriveInternalEndPreparation", "onlyTokenOwner", "placeOwner"],
  ["internal-transition-event-race-preparation.ts", "deriveInternalEventRacePreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-local-control-preparation.ts", "deriveInternalChoosePreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-local-control-preparation.ts", "deriveInternalDuplicatePreparation", "onlyTokenOwner", "placeOwner"],
  ["internal-transition-local-control-preparation.ts", "deriveInternalSelectManyPreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-local-control-preparation.ts", "deriveInternalSynchronizePreparation", "commonTokenOwner", "placeOwner"],
  ["internal-transition-parallel-multi-instance-preparation.ts", "deriveInternalParallelMultiInstancePreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["internal-transition-regional-preparation.ts", "selectRegionalTransition", "onlyTokenOwner", "placeOwner"],
  ["internal-transition-scope-creation-preparation.ts", "deriveInternalEnterScopePreparation", "onlyTokenOwner", "placeOwner"],
  ["internal-transition-scope-creation-preparation.ts", "deriveInternalInvokeProcessPreparation", "onlyTokenOwner", "placeOwner"],
  ["internal-transition-sequential-multi-instance-preparation.ts", "deriveInternalSequentialMultiInstancePreparation", "onlyTokenOwner", "outsideAlphabet"],
  ["interrupting-message-event-subprocess-runtime.ts", "armEventSubProcessMessageSubscriptions", byDefinitionScope, "outsideAlphabet"],
  ["interrupting-message-event-subprocess-runtime.ts", "selectEventSubProcessCompletion", byDefinitionScope, "outsideAlphabet"],
  ["interrupting-message-event-subprocess-state-validation.ts", "interruptingMessageEventSubProcessStateIsValid", byDefinitionScope, "outsideAlphabet"],
  ["nested-scope-data.ts", "calledRootFrameValid", "calledRootMappings", "callRecordData"],
  ["nested-scope-data.ts", "nestedScopeDeclaredNames", "calledRootMappings", "callRecordData"],
  ["nested-scope-data.ts", "nestedScopeDeclaredNames", "mappedCalledRoot", "calledDefinitionKind"],
  ["nested-scope-data.ts", "nestedScopeFramesValid", "mappedCalledRoot", "calledDefinitionKind"],
  ["nested-scope-data.ts", "nestedScopeFramesValid", byDefinitionScope, "calledDefinitionData"],
  ["nested-scope-data.ts", "occurrenceWithParent", byDefinitionScope, "calledDefinitionData"],
  ["nested-scope-data.ts", "resolveOwner", "mappedCalledRoot", "calledDefinitionKind"],
  ["parallel-scope-runtime.ts", "enterParallelScope", byDefinitionScope, "outsideAlphabet"],
  ["parallel-scope-state-validation.ts", "parallelScopeCheckpointValid", byDefinitionScope, "outsideAlphabet"],
  ["parallel-scope-state-validation.ts", "parallelScopeStateValid", byDefinitionScope, "outsideAlphabet"],
  ["semantic-process-bounded-scope-runtime.ts", "selectScopeCompletionWithdrawal", byDefinitionScope, "outsideAlphabet"],
  ["semantic-process-runtime.ts", "applyInternalOperationState", byDefinitionScope, "callerScope"],
  ["semantic-process-runtime.ts", "applyInternalOperationState", "commonTokenOwner", "placeOwner"],
  ["semantic-process-runtime.ts", "applyInternalOperationState", "completeScopeOwner", "callerScope"],
  ["semantic-process-runtime.ts", "applyInternalOperationState", "onlyTokenOwner", "placeOwner"],
  ["semantic-process-runtime.ts", "attemptInternalOperationStep", "onlyTokenOwner", "placeOwner"],
  ["semantic-process-runtime.ts", "completeScopeOwner", byDefinitionScope, "callerScope"],
  ["semantic-process-scope-runtime.ts", "commonTokenOwner", "onlyTokenOwner", "selectorDefinition"],
  ["semantic-process-scope-runtime.ts", "enterConcurrentChildScope", "tokenOwners", "outsideAlphabet"],
  ["semantic-process-scope-runtime.ts", "onlyTokenOwner", "tokenOwners", "selectorDefinition"],
  ["semantic-process-scope-runtime.ts", "selectChildScopeEntry", byDefinitionScope, "callerScope"],
  ["semantic-process-scope-runtime.ts", "selectScopeCompletion", byDefinitionScope, "callerScope"],
  ["sequential-scope-state-validation.ts", "sequentialScopeCheckpointValid", byDefinitionScope, "outsideAlphabet"],
  ["sequential-scope-state-validation.ts", "sequentialScopeStateValid", byDefinitionScope, "outsideAlphabet"],
];

const leanSites: ReadonlyArray<Site> = [
  ["ActivityDataInput.lean", "activateDataInputUserTask?", "onlyTokenOwner?", "outsideAlphabet"],
  ["ActivityDataInputOutputRuntime.lean", "activateDataInputOutputUserTask?", "onlyTokenOwner?", "outsideAlphabet"],
  ["ActivityDataOutput.lean", "activateDataOutputUserTask?", "onlyTokenOwner?", "outsideAlphabet"],
  ["BoundedScopeArming.lean", "armBoundedScopeState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["BoundedTask.lean", "armBoundedUserTaskState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["CallActivity.lean", "invokeProcessState?", "onlyTokenOwner?", "placeOwner"],
  ["CallDataTransfer.lean", "invokeProcessWithDataState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["CallVariableMapping.lean", "invokeState?", "onlyTokenOwner?", "calledDefinitionData"],
  ["CompensationActivityRetention.lean", "childRetentionStateValid", byDefinitionScope, "outsideAlphabet"],
  ["CompensationActivityRetentionProducers.lean", "enterParallelMultiInstanceWithCompensation?", "onlyTokenOwner?", "outsideAlphabet"],
  ["CompensationActivityRetentionProducers.lean", "enterSequentialMultiInstanceWithCompensation?", "onlyTokenOwner?", "outsideAlphabet"],
  ["CompensationEventSubProcessSnapshotTransition.lean", "childOccurrenceAfterEntry?", "onlyTokenOwner?", "outsideAlphabet"],
  ["CompensationEventSubProcessSnapshotTransition.lean", "selectedCompletionOccurrence?", byDefinitionScope, "outsideAlphabet"],
  ["CompensationTriggerHandlerTransition.lean", "attemptCompensationTrigger", "onlyTokenOwner?", "outsideAlphabet"],
  ["EventBasedGateway.lean", "armEventRaceState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["FlowNodeOccurrenceBoundaryStarts.lean", "candidateParallelScopeStarts?", byDefinitionScope, "outsideAlphabet"],
  ["FlowNodeOccurrenceBoundaryStarts.lean", "candidateSequentialScopeStarts?", byDefinitionScope, "outsideAlphabet"],
  ["FlowNodeOccurrenceLifecycle.lean", "flowNodeSelectedOperationOwner?", "commonTokenOwner?", "placeOwner"],
  ["FlowNodeOccurrenceLifecycle.lean", "flowNodeSelectedOperationOwner?", "onlyTokenOwner?", "placeOwner"],
  ["InclusiveGateway.lean", "selectManyState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["InternalCommutationCore.lean", "prepareInternalArm?", "onlyTokenOwner?", "placeOwner"],
  ["InternalDataArmingPreparation.lean", "prepareInternalDataArmingContract?", "onlyTokenOwner?", "outsideAlphabet"],
  ["InternalLocalControlSelection.lean", "selectInternalLocalControl?", "commonTokenOwner?", "placeOwner"],
  ["InternalLocalControlSelection.lean", "selectInternalLocalControl?", "onlyTokenOwner?", "placeOwner"],
  ["InternalMessageTaskPreparation.lean", "prepareInternalMessageTaskContract?", "onlyTokenOwner?", "outsideAlphabet"],
  ["InternalRegionalSelection.lean", "selectInternalRegional?", "onlyTokenOwner?", "placeOwner"],
  ["InternalScopeCreationSelection.lean", "selectInternalScopeCreation?", byDefinitionScope, "callerScope"],
  ["InternalScopeCreationSelection.lean", "selectInternalScopeCreation?", "onlyTokenOwner?", "placeOwner"],
  ["InternalTimerTaskPreparation.lean", "prepareInternalTimerTaskContract?", "onlyTokenOwner?", "outsideAlphabet"],
  ["InterruptingMessageEventSubProcessCompletion.lean", "completeEventSubProcessState?", byDefinitionScope, "outsideAlphabet"],
  ["InterruptingMessageEventSubProcessInterruption.lean", "selectEventSubProcessMessageDelivery?", byDefinitionScope, "outsideAlphabet"],
  ["InterruptingMessageEventSubProcessRegistration.lean", "registerEventSubProcessListener?", byDefinitionScope, "outsideAlphabet"],
  ["MessageBoundedTask.lean", "armMessageBoundedUserTaskState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["MonitoredTask.lean", "armMonitoredUserTaskState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["NestedScopeDataCommand.lean", "declaredNames", "calledRootMappings?", "calledDefinitionData"],
  ["ParallelMultiInstanceTransition.lean", "enterSharedParallelMultiInstance?", "onlyTokenOwner?", "outsideAlphabet"],
  ["ParallelScopeRuntime.lean", "enterParallelScope?", byDefinitionScope, "outsideAlphabet"],
  ["RuntimeState.lean", "commonTokenOwner?", "onlyTokenOwner?", "selectorDefinition"],
  ["RuntimeState.lean", "enterScopeState?", byDefinitionScope, "callerScope"],
  ["RuntimeState.lean", "enterScopeState?", "onlyTokenOwner?", "placeOwner"],
  ["SequentialMultiInstanceTransition.lean", "enterSequentialMultiInstance?", "onlyTokenOwner?", "outsideAlphabet"],
  ["SequentialScopeRuntime.lean", "enterSequentialScope?", "onlyTokenOwner?", "outsideAlphabet"],
  ["SequentialScopeRuntime.lean", "issueSequentialScope?", byDefinitionScope, "outsideAlphabet"],
  ["SequentialScopeStateValidation.lean", "sequentialScopeStateValid", byDefinitionScope, "outsideAlphabet"],
  ["TransactionCancellation.lean", "attemptTransactionCancellation", "onlyTokenOwner?", "outsideAlphabet"],
  ["TransactionCancellation.lean", "enterScopeWithCompensationRetention?", byDefinitionScope, "outsideAlphabet"],
  ["TransitionStates.lean", "awaitEffectState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["TransitionStates.lean", "awaitMessageState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["TransitionStates.lean", "awaitTimerState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["TransitionStates.lean", "awaitUserTaskState?", "onlyTokenOwner?", "placeOwner"],
  ["TransitionStates.lean", "chooseState?", "onlyTokenOwner?", "outsideAlphabet"],
  ["TransitionStates.lean", "duplicateState?", "onlyTokenOwner?", "placeOwner"],
  ["TransitionStates.lean", "reachNoneEndState?", "onlyTokenOwner?", "placeOwner"],
  ["TransitionStates.lean", "synchronizeState?", "commonTokenOwner?", "placeOwner"],
  ["TransitionStates.lean", "throwErrorState?", "onlyTokenOwner?", "outsideAlphabet"],
];

const siteKey = (file: string, definition: string, selector: string) => `${file}#${definition}:${selector}`;

function trackedFiles(directory: string, extension: string): ReadonlyArray<string> {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", directory],
    { cwd: projectRoot, encoding: "utf8" }).split("\n").filter((file) => file.endsWith(extension)).sort();
}

/** The text after `open` up to its balancing parenthesis, bounded to one short selector argument. */
function balanced(source: string, open: number): string {
  let depth = 1;
  let index = open;
  while (index < source.length && index < open + 260 && depth > 0) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") depth -= 1;
    index += 1;
  }
  return source.slice(open, index);
}

/** A scope-occurrence lookup keyed by definition scope alone, never by process instance or whole occurrence identity. */
function selectsByDefinitionScope(body: string, pattern: RegExp): boolean {
  return [...body.matchAll(pattern)].some((match) => {
    const argument = balanced(body, match.index + match[0].length);
    return argument.includes("definitionScopeId") && !argument.includes("processInstanceId") &&
      !argument.includes("sameScopeOccurrence");
  });
}

function typeScriptCensus(): string[] {
  const selector = /\b(onlyTokenOwner|commonTokenOwner|tokenOwners|calledRootMappings|mappedCalledRoot|completeScopeOwner)\(/g;
  return trackedFiles("packages/semantic-core/src", ".ts").flatMap((file) => {
    const source = readFileSync(path.join(projectRoot, file), "utf8");
    const starts = [...source.matchAll(/^(?:export )?function (\w+)/gm)];
    return starts.flatMap((start, index) => {
      const name = start[1]!;
      const body = source.slice(start.index, starts[index + 1]?.index ?? source.length);
      const selectors = new Set([...body.matchAll(selector)].map((match) => match[1]!));
      if (selectsByDefinitionScope(body, /scopeOccurrences\s*\.\s*(?:filter|find|some|every|findIndex)\s*\(/g)) {
        selectors.add(byDefinitionScope);
      }
      selectors.delete(name);
      return [...selectors].map((found) => siteKey(path.basename(file), name, found));
    });
  });
}

function leanCensus(): string[] {
  const selector = /(onlyTokenOwner\?|calledRootMappings\?|commonTokenOwner\?)/g;
  const declaration = new RegExp(
    `^${leanDeclarationPrefix()}(def|theorem|lemma|abbrev|instance|structure|inductive|example|opaque)\\s+(\\S+)`, "gm");
  return trackedFiles("BpmnSemantics", ".lean")
    .filter((file) => !file.includes("/Experiments/") && !file.endsWith("Conformance.lean"))
    .flatMap((file) => {
      const source = readFileSync(path.join(projectRoot, file), "utf8");
      const starts = [...source.matchAll(declaration)];
      return starts.flatMap((start, index) => {
        if (!["def", "abbrev", "opaque"].includes(start[1]!)) return [];
        const name = start[2]!;
        const body = source.slice(start.index, starts[index + 1]?.index ?? source.length);
        const selectors = new Set([...body.matchAll(selector)].map((match) => match[1]!));
        if (/scopeOccurrences\.(?:filter|find\?|any|all|count)\s*\(?\s*fun\s+\w+\s*=>\s*\w+\.id\.definitionScopeId\s*==/.test(body)) {
          selectors.add(byDefinitionScope);
        }
        selectors.delete(name);
        return [...selectors].map((found) => siteKey(path.basename(file), name, found));
      });
    });
}

function assertClosed(actualKeys: ReadonlyArray<string>, registered: ReadonlyArray<Site>, language: string): void {
  const registeredKeys = registered.map(([file, definition, selector]) => siteKey(file, definition, selector));
  assert.deepEqual(actualKeys.filter((site) => !registeredKeys.includes(site)), [],
    `unclassified ${language} selector sites: classify them in this census`);
  assert.deepEqual(registeredKeys.filter((site) => !actualKeys.includes(site)), [],
    `stale ${language} census rows: remove them`);
}

test("every TypeScript selector site on a Program path is classified for the Call forest", () => {
  assertClosed(typeScriptCensus(), typeScriptSites, "TypeScript");
});

test("every Lean selector definition is classified for the Call forest", () => {
  assertClosed(leanCensus(), leanSites, "Lean");
});
