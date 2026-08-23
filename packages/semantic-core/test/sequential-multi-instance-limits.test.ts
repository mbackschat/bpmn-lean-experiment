/**
 * `SMI-ADMIT-01`: the profile's declared limits, measured at both boundaries that see a collection.
 *
 * The oracle is the capsule's limits contract: at most `maximumItems` items, each within
 * `maximumItemUtf8Bytes`, whose canonical form is within `maximumCanonicalCollectionUtf8Bytes`. Entry
 * measures the input collection the host supplied; inner completion measures the candidate output
 * collection that completion would store. The two halves are only meaningful against each other, which
 * is why they share a file: one bound enforced on one side is not the contract, and the collection bound
 * is crossed by the *last* accepted result over an input entry admitted, so neither side alone reaches
 * the interesting state.
 *
 * Every negative is paired with an admitting complement differing in exactly one measure, so a refusal
 * is attributable to the bound it crosses rather than to the shape of the collection. A refusal commits
 * nothing at all: no truncation, no clamp, and on the completion side no stored slot.
 *
 * These cases are evidence about the TypeScript measure alone. It counts canonical bytes through
 * `JSON.stringify`, which is escape-aware, while Lean measures the same collection escape-blind and
 * records that as an undercount in an open cross-target lane. The two escape cases below sit exactly
 * where the targets are known to disagree, so nothing here may be read as cross-target agreement.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  VariableValueKind,
  applyInternalOperation,
  completeSequentialMultiInstanceIteration,
  sequentialMultiInstanceLimits,
  utf8ByteLength,
  type RuntimeState,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  outputBinding,
  reviewProgram,
  startWithCollection,
  startedState,
} from "./sequential-multi-instance-fixture.ts";

const { maximumItems, maximumItemUtf8Bytes, maximumCanonicalCollectionUtf8Bytes } =
  sequentialMultiInstanceLimits;

/**
 * Equal-length items of this size are the largest maximum-cardinality collection inside the canonical
 * bound. Both facts are asserted where the constant is used rather than trusted, because the margin is
 * the cost of the structural characters `JSON.stringify` adds and nothing else pins it.
 */
const fittingItemLength = 508;

function repeatedItems(
  character: string,
  length: number,
  count: number,
): ReadonlyArray<string> {
  return Array.from({ length: count }, () => character.repeat(length));
}

function operationOfKind(kind: SemanticOperationKind) {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined, `the fixture must carry one ${kind}`);
  return operation;
}

/**
 * What entry commits for one collection, or `null` when a bound refuses it.
 *
 * The bounds constrain a runtime value rather than the admitted shape, so the definition is identical
 * for every collection below and only the value changes.
 */
function enterWith(collection: ReadonlyArray<string>): RuntimeState | null {
  const initiated = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.Initiate),
    startedState(startWithCollection("start-bounded-review", collection)),
  );
  assert.ok(initiated !== null, "the initiation must apply");
  return applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.AwaitSequentialMultiInstanceUserTask),
    initiated,
  );
}

function complete(
  state: RuntimeState,
  counter: number,
  result: string,
): RuntimeState {
  const next = completeSequentialMultiInstanceIteration(
    reviewProgram,
    state,
    completeIteration(counter, result),
  );
  assert.ok(next !== null, `iteration ${counter} must commit`);
  return next;
}

/**
 * The state after accepting `results` in order, over a collection at the cardinality bound.
 *
 * Single-character input items keep the input collection far inside every bound, so the only measure
 * that grows across these completions is the candidate output collection.
 */
function afterResults(results: ReadonlyArray<string>): RuntimeState {
  const entered = enterWith(repeatedItems("a", 1, maximumItems));
  assert.ok(entered !== null, "the input collection must be admitted");
  let state = entered;
  for (const [counter, result] of results.entries()) {
    state = complete(state, counter, result);
  }
  return state;
}

test("a collection one item past the cardinality bound is refused", () => {
  // Single-character items keep both byte measures far inside their bounds, so cardinality is the only
  // measure that changes between the two collections.
  assert.ok(
    enterWith(repeatedItems("a", 1, maximumItems)) !== null,
    "exactly the cardinality bound is admitted",
  );
  assert.equal(
    enterWith(repeatedItems("a", 1, maximumItems + 1)),
    null,
    "one item more commits nothing",
  );
});

test("an item one byte past the item bound is refused", () => {
  const admitted = repeatedItems("a", maximumItemUtf8Bytes, 1);
  const refused = repeatedItems("a", maximumItemUtf8Bytes + 1, 1);
  assert.ok(
    utf8ByteLength(JSON.stringify(refused)) <= maximumCanonicalCollectionUtf8Bytes,
    "the refused collection stays inside the canonical bound, so only the item bound decides",
  );
  assert.ok(enterWith(admitted) !== null, "exactly the item bound is admitted");
  assert.equal(enterWith(refused), null, "one byte more commits nothing");
});

test("a collection past the canonical bound is refused with its count and every item inside theirs", () => {
  const admitted = repeatedItems("x", fittingItemLength, maximumItems);
  const refused = repeatedItems("x", maximumItemUtf8Bytes, maximumItems);
  assert.ok(
    utf8ByteLength(JSON.stringify(admitted)) <= maximumCanonicalCollectionUtf8Bytes &&
      utf8ByteLength(JSON.stringify(refused)) > maximumCanonicalCollectionUtf8Bytes,
    "the two collections differ only in the canonical measure they cross",
  );
  assert.ok(enterWith(admitted) !== null);
  assert.equal(enterWith(refused), null, "maximum-size items at maximum cardinality do not fit");
});

/**
 * The canonical measure is escape-aware, and this is where that decides an entry.
 *
 * Each item is a run of quote characters: one byte raw, two canonical. Every item stays inside the item
 * bound and the count inside the cardinality bound, and the same item lengths without escapes fit the
 * canonical bound, so escaping alone crosses it.
 */
test("escaped characters count toward the canonical bound", () => {
  const escaped = repeatedItems('"', fittingItemLength, maximumItems);
  assert.ok(
    escaped.every((item) => utf8ByteLength(item) <= maximumItemUtf8Bytes),
    "no item crosses the item bound",
  );
  assert.ok(
    utf8ByteLength(JSON.stringify(repeatedItems("x", fittingItemLength, maximumItems))) <=
      maximumCanonicalCollectionUtf8Bytes,
    "an escape-blind measure of these lengths admits the collection",
  );
  assert.ok(
    utf8ByteLength(JSON.stringify(escaped)) > maximumCanonicalCollectionUtf8Bytes,
  );
  assert.equal(enterWith(escaped), null);
});

/**
 * The completion that would publish a collection past the profile's own canonical bound.
 *
 * Reachable at the declared maximum rather than through an exotic input: sixteen results of the maximum
 * item size are each inside the item bound and their count is exactly the cardinality bound, yet their
 * canonical array measures past the collection bound. The same sixteen items cannot arrive as the input,
 * because entry measures that collection with the same owner and refuses it, so the witness is a short
 * input followed by maximum-size results. The last result is the one that crosses, which is why
 * enforcing this on the non-final arm alone would leave the crossing result unchecked.
 */
test("a completion that would push the candidate collection past the canonical bound is refused", () => {
  const filled = repeatedItems("a", maximumItemUtf8Bytes, maximumItems - 1);
  const before = afterResults(filled);
  const maximumResult = "a".repeat(maximumItemUtf8Bytes);
  assert.ok(
    utf8ByteLength(JSON.stringify([...filled, maximumResult])) >
      maximumCanonicalCollectionUtf8Bytes,
    "the candidate collection crosses the bound on the last result",
  );
  assert.equal(outputBinding(before), undefined, "nothing is published yet");

  assert.equal(
    completeSequentialMultiInstanceIteration(
      reviewProgram,
      before,
      completeIteration(maximumItems - 1, maximumResult),
    ),
    null,
    "the completion is refused whole, not stored, truncated, or clamped",
  );

  // The admitting complement is the same pre-state and the same iteration with a result whose length
  // lands the candidate collection exactly on the bound, which is inclusive.
  const fitting = maximumCanonicalCollectionUtf8Bytes -
    utf8ByteLength(JSON.stringify([...filled, ""]));
  const finalResult = "a".repeat(fitting);
  assert.deepEqual(
    outputBinding(complete(before, maximumItems - 1, finalResult))?.value,
    {
      kind: VariableValueKind.StringList,
      value: [...filled, finalResult],
    },
    "exactly the bound publishes",
  );
});

test("a submitted result one byte past the item bound is refused", () => {
  const before = afterResults([]);
  const refused = "a".repeat(maximumItemUtf8Bytes + 1);
  assert.ok(
    utf8ByteLength(JSON.stringify([refused])) <=
      maximumCanonicalCollectionUtf8Bytes,
    "the candidate collection stays inside the collection bound, so only the item bound decides",
  );
  assert.equal(
    completeSequentialMultiInstanceIteration(
      reviewProgram,
      before,
      completeIteration(0, refused),
    ),
    null,
  );
  assert.ok(
    completeSequentialMultiInstanceIteration(
      reviewProgram,
      before,
      completeIteration(0, "a".repeat(maximumItemUtf8Bytes)),
    ) !== null,
    "exactly the item bound commits",
  );
});

/**
 * The candidate collection is measured escape-aware, and this is where that decides a completion.
 *
 * The last result is a run of quote characters: one byte raw, two canonical. It stays inside the item
 * bound, the count is the cardinality bound, and the same lengths without escapes fit the collection
 * bound, so escaping alone crosses it. Together with the entry-side case above, this is what shows both
 * boundaries measure through one owner rather than through two byte counts that agree by luck.
 */
test("escaped characters in a submitted result count toward the candidate bound", () => {
  const filled = repeatedItems("x", fittingItemLength, maximumItems - 1);
  const before = afterResults(filled);
  const escaped = '"'.repeat(fittingItemLength);
  const plain = "x".repeat(fittingItemLength);
  assert.ok(
    utf8ByteLength(escaped) <= maximumItemUtf8Bytes,
    "the escaped result is inside the item bound",
  );
  assert.ok(
    utf8ByteLength(JSON.stringify([...filled, plain])) <=
      maximumCanonicalCollectionUtf8Bytes,
    "an escape-blind measure of these lengths admits the collection",
  );
  assert.ok(
    utf8ByteLength(JSON.stringify([...filled, escaped])) >
      maximumCanonicalCollectionUtf8Bytes,
  );

  assert.equal(
    completeSequentialMultiInstanceIteration(
      reviewProgram,
      before,
      completeIteration(maximumItems - 1, escaped),
    ),
    null,
  );
  assert.ok(
    outputBinding(complete(before, maximumItems - 1, plain)) !== undefined,
    "the same length without escapes publishes",
  );
});
