import BpmnSemantics.SequentialMultiInstanceConformanceFixtures

/-! # Sequential Multi-Instance canonical JSON conformance

Canonical JSON escape accounting and candidate-boundary refusals for the shared Sequential
Multi-Instance fixture chain.
-/

namespace BpmnSemantics.SequentialMultiInstanceConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SequentialMultiInstanceProgramBindingConformance

set_option synthInstance.maxSize 2000

/-! ## Canonical JSON escape accounting

These fixtures separate raw UTF-8 size from the bytes JavaScript `JSON.stringify` emits. The profile
keeps its raw per-item bound, while its collection bound measures the complete escaped JSON array.
-/

/-- Quotes, backslashes, named controls, other controls, and ordinary non-ASCII scalars take their
exact canonical JSON byte sizes, framing quotes included. -/
theorem the_shared_json_measure_accounts_for_every_escape_class :
    (canonicalJsonStringUtf8Bytes "\"", canonicalJsonStringUtf8Bytes "\\",
        canonicalJsonStringUtf8Bytes "\u0008", canonicalJsonStringUtf8Bytes "\u000c",
        canonicalJsonStringUtf8Bytes "\n", canonicalJsonStringUtf8Bytes "\r",
        canonicalJsonStringUtf8Bytes "\t", canonicalJsonStringUtf8Bytes "\u0001",
        canonicalJsonStringUtf8Bytes "é") =
      (4, 4, 4, 4, 4, 4, 4, 8, 4) := by
  decide +kernel

/-- Pure arithmetic for the full-profile quote-expansion counterexample. No fixture constructs the
eight-thousand-character collection: sixteen 508-byte quote strings are inside the item limit and
measure 8177 under the obsolete raw formula, while exact JSON escaping measures 16305. -/
theorem quote_expansion_separates_the_raw_and_canonical_collection_bounds :
    508 ≤ profileLimits.maximumItemUtf8Bytes ∧
      16 = profileLimits.maximumItems ∧
      16 * (508 + 2) + 15 + 2 = 8177 ∧
      8177 ≤ profileLimits.maximumCanonicalCollectionUtf8Bytes ∧
      16 * (2 * 508 + 2) + 15 + 2 = 16305 ∧
      profileLimits.maximumCanonicalCollectionUtf8Bytes < 16305 := by
  decide +kernel

private def escapeClassCollection : List String :=
  ["\"", "\\", "\u0008", "\u0001"]

/-- Entry refuses a small collection that the obsolete raw measure puts at seventeen bytes while
exact quote, backslash, named-control, and other-control escaping puts it at twenty-five. -/
theorem every_escape_class_is_counted_at_entry :
    (do
      let arm ← arm?
      let state ← preEntryWith escapeClassCollection
      enterSequentialMultiInstance?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 17 } }
        state) = none := by
  decide +kernel

private def escapeClassResult : String :=
  "\"\\\u0008\u0001"

/-- The same four escape classes gate the final candidate before publication. Its obsolete raw
measure is thirty-four bytes and its exact JSON measure is forty-two. -/
theorem every_escape_class_is_counted_at_the_final_candidate_boundary :
    (do
      let arm ← arm?
      let state ← afterSecondResult?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 34 } }
        state body
        [{ name := arm.data.taskDataOutputId, value := .string escapeClassResult }]) = none := by
  decide +kernel

end BpmnSemantics.SequentialMultiInstanceConformance
