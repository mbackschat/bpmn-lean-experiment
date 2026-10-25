module

public import BpmnSemantics.SequentialMultiInstanceConformanceFixtures
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.CheckedGraphValidation
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
import all Init.Data.Ord.String
import all Lean.Data.Json.Basic
import all Std.Data.TreeMap.Raw.Basic
import all Std.Data.DTreeMap.Raw.Basic
import all Std.Data.DTreeMap.Internal.Def
import all Std.Data.DTreeMap.Internal.Balancing
import all Std.Data.DTreeMap.Internal.Operations
import all Std.Data.DTreeMap.Internal.Queries
import all Init.Data.List.Control
import all Init.Data.String.Basic
import all Init.Data.String.Bootstrap
import all Init.Data.String.Decode
import all Init.Data.String.Defs
import all Init.Data.String.Extra
import all Init.Data.String.FindPos
import all Init.Data.String.Hashable
import all Init.Data.String.Iter
import all Init.Data.String.Iter.Basic
import all Init.Data.String.Iter.Intercalate
import all Init.Data.String.Iterate
import all Init.Data.String.Iterator
import all Init.Data.String.Legacy
import all Init.Data.String.Length
import all Init.Data.String.Modify
import all Init.Data.String.OrderInstances
import all Init.Data.String.Pattern
import all Init.Data.String.Pattern.Basic
import all Init.Data.String.Pattern.Char
import all Init.Data.String.Pattern.Pred
import all Init.Data.String.Pattern.String
import all Init.Data.String.PosRaw
import all Init.Data.String.Search
import all Init.Data.String.Slice
import all Init.Data.String.Stream
import all Init.Data.String.Subslice
import all Init.Data.String.Substring
import all Init.Data.String.TakeDrop
import all Init.Data.String.Termination
import all Init.Data.String.ToSlice
import all Lean.Data.Json.Basic
import all Lean.Data.Json.Elab
import all Lean.Data.Json.FromToJson
import all Lean.Data.Json.FromToJson.Basic
import all Lean.Data.Json.FromToJson.Extra
import all Lean.Data.Json.Parser
import all Lean.Data.Json.Printer
import all Lean.Data.Json.Stream

/-! Fixture definitions and executable checks of [`SequentialMultiInstanceCanonicalJsonConformance`](SequentialMultiInstanceCanonicalJsonConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

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
def the_shared_json_measure_accounts_for_every_escape_class : Bool := decide <|
    (canonicalJsonStringUtf8Bytes "\"", canonicalJsonStringUtf8Bytes "\\",
        canonicalJsonStringUtf8Bytes "\u0008", canonicalJsonStringUtf8Bytes "\u000c",
        canonicalJsonStringUtf8Bytes "\n", canonicalJsonStringUtf8Bytes "\r",
        canonicalJsonStringUtf8Bytes "\t", canonicalJsonStringUtf8Bytes "\u0001",
        canonicalJsonStringUtf8Bytes "é") =
      (4, 4, 4, 4, 4, 4, 4, 8, 4)

/-- Pure arithmetic for the full-profile quote-expansion counterexample. No fixture constructs the
eight-thousand-character collection: sixteen 508-byte quote strings are inside the item limit and
measure 8177 under the obsolete raw formula, while exact JSON escaping measures 16305. -/
def quote_expansion_separates_the_raw_and_canonical_collection_bounds : Bool := decide <|
    508 ≤ profileLimits.maximumItemUtf8Bytes ∧
      16 = profileLimits.maximumItems ∧
      16 * (508 + 2) + 15 + 2 = 8177 ∧
      8177 ≤ profileLimits.maximumCanonicalCollectionUtf8Bytes ∧
      16 * (2 * 508 + 2) + 15 + 2 = 16305 ∧
      profileLimits.maximumCanonicalCollectionUtf8Bytes < 16305

def escapeClassCollection : List String :=
  ["\"", "\\", "\u0008", "\u0001"]

/-- Entry refuses a small collection that the obsolete raw measure puts at seventeen bytes while
exact quote, backslash, named-control, and other-control escaping puts it at twenty-five. -/
def every_escape_class_is_counted_at_entry : Bool := decide <|
    (do
      let arm ← arm?
      let state ← preEntryWith escapeClassCollection
      enterSequentialMultiInstance?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 17 } }
        state) = none

def escapeClassResult : String :=
  "\"\\\u0008\u0001"

/-- The same four escape classes gate the final candidate before publication. Its obsolete raw
measure is thirty-four bytes and its exact JSON measure is forty-two. -/
def every_escape_class_is_counted_at_the_final_candidate_boundary : Bool := decide <|
    (do
      let arm ← arm?
      let state ← afterSecondResult?
      let record ← state.activityOccurrences.head?
      let body ← activityBodyTask? record
      completeSequentialMultiInstanceInnerTask?
        { arm with limits := { arm.limits with maximumCanonicalCollectionUtf8Bytes := 34 } }
        state body
        [{ name := arm.data.taskDataOutputId, value := .string escapeClassResult }]) = none

/-- Every executable check of this module, named for the driver's failure report. -/
def sequentialMultiInstanceCanonicalJsonConformanceChecks : List (String × Bool) := [
  ("the_shared_json_measure_accounts_for_every_escape_class", the_shared_json_measure_accounts_for_every_escape_class),
  ("quote_expansion_separates_the_raw_and_canonical_collection_bounds", quote_expansion_separates_the_raw_and_canonical_collection_bounds),
  ("every_escape_class_is_counted_at_entry", every_escape_class_is_counted_at_entry),
  ("every_escape_class_is_counted_at_the_final_candidate_boundary", every_escape_class_is_counted_at_the_final_candidate_boundary)
]

end BpmnSemantics.SequentialMultiInstanceConformance
