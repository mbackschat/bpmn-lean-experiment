import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { analyzeLeanSource, leanDeclarationPrefix } from "./lean-source-analysis.ts";

const semanticRoot = new URL("../BpmnSemantics/SemanticProcess/", import.meta.url);

function code(name: string): string {
  return analyzeLeanSource(readFileSync(new URL(`${name}.lean`, semanticRoot), "utf8")).code;
}

test("regional removal names agreement laws for the previously unrepresented owner collections", () => {
  const source = code("InternalRegionalRemovalAgreement") + code("InternalRegionalActivityRemoval");
  for (const theorem of [
    "cancelScopeSubtree_event_subprocess_subscriptions_eq_prepared_region",
    "cancelScopeSubtree_scope_variables_eq_prepared_region",
    "cancelScopeSubtree_process_interfaces_eq_prepared_region",
    "cancelScopeSubtree_scope_controllers_eq_prepared_region",
  ]) {
    const declaration = new RegExp(`^${leanDeclarationPrefix()}theorem ${theorem}\\b`, "m");
    assert.ok(declaration.test(source), `missing agreement: ${theorem}`);
  }
});

test("cancellation evaluates one named owner classifier", () => {
  const source = code("ScopeCancellation");
  assert.ok(/^(?:@\[[^\]]+\] )?def scopeCancellationOwner\b/m.test(source), "missing shared cancellation owner classifier");
  const cancellation = source.split("def cancelScopeSubtree (")[1]?.split("theorem")[0];
  assert.ok(cancellation !== undefined);
  assert.match(cancellation, /let cancelled := scopeCancellationOwner state root/);
  assert.doesNotMatch(cancellation, /let cancelled := fun owner/);
});

test("the duplicate removal preservation pairs consume shared sublist laws", () => {
  for (const owner of ["InternalRegionalRemovalValidity", "InternalRegionalCallRemovalValidity"]) {
    const source = code(owner);
    for (const shared of [
      "runtimeStateIdentityBound_of_removal",
      "waitDeclarationsValid_of_removal",
      "hiddenRecordDeclarationsValid_of_removal",
    ]) {
      assert.ok(source.includes(`exact ${shared}`), `${owner} does not consume ${shared}`);
    }
  }
  const order = code("InternalRegionalRemovalOrder");
  assert.equal(order.match(/exact canonicalCollectionOrder_of_removal\b/g)?.length, 2);
});

test("failure cleanup shares direct owner filtering without inheriting listener disposal", () => {
  const source = code("RuntimeOwnerRemoval");
  const sharedFilter = source.split("def filterScopeOwnedWork (")[1]?.split("def clearCompensationFailureWork")[0];
  assert.ok(sharedFilter !== undefined);
  assert.doesNotMatch(sharedFilter, /eventSubProcessMessageSubscriptions\s*:=/);
  const failure = source.split("def clearCompensationFailureWork (")[1];
  assert.ok(failure !== undefined);
  assert.equal(failure.match(/filterScopeOwnedWork state/g)?.length, 1);
  for (const owner of ["CompensationTriggerHandlerCompletion", "CompensationTriggerHandlerCancellation"]) {
    assert.ok(code(owner).includes("clearCompensationFailureWork"), `${owner} repeats cleanup`);
  }
  assert.doesNotMatch(code("TransactionCancellationSemantics"), /transaction_handler_failure_clears_all_live_work/);
});
