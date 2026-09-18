import BpmnSemantics.SemanticProcess.ScopeStorageOrder

/-! # Canonical Call record storage

Scope creation sorts its retained Call associations. The runtime collection-order invariant needs
that sort to establish canonical order, independently of reachability's permutation law.
-/

namespace BpmnSemantics.SemanticProcess

theorem callRecordBefore_asymm (left right : CalledProcessOccurrence) :
    callRecordBefore left right = true → callRecordBefore right left = false := by
  by_cases same : left.caller = right.caller
  · have rest : decide (left.id.activation < right.id.activation) = true →
        decide (right.id.activation < left.id.activation) = false := by
      simp only [decide_eq_true_eq, decide_eq_false_iff_not]
      exact Nat.lt_asymm
    have lex := armingLexStep_asymm (fun _ _ => String.lt_asymm)
      left.id.elementId.value right.id.elementId.value _ _ rest
    simpa [callRecordBefore, same, scopeOwnerBefore, armingLexStep] using lex
  · by_cases first : scopeOwnerBefore left.caller right.caller = true
    · have reverse := scopeOwnerBefore_asymm left.caller right.caller first
      simp [callRecordBefore, first, reverse, Ne.symm same]
    · simp [callRecordBefore, first, same]

theorem insertCallRecord_eq_canonicalInsertBy (record : CalledProcessOccurrence)
    (records : List CalledProcessOccurrence) :
    insertCallRecord record records = canonicalInsertBy callRecordBefore record records := by
  induction records with
  | nil => rfl
  | cons current rest ih => simp only [insertCallRecord, canonicalInsertBy, ih]

theorem orderedBy_insertCallRecord (record : CalledProcessOccurrence)
    (records : List CalledProcessOccurrence)
    (ordered : orderedBy callRecordBefore records = true) :
    orderedBy callRecordBefore (insertCallRecord record records) = true := by
  rw [insertCallRecord_eq_canonicalInsertBy]
  exact orderedBy_canonicalInsertBy callRecordBefore callRecordBefore_asymm record records ordered

theorem orderedBy_sortCallRecords (records : List CalledProcessOccurrence) :
    orderedBy callRecordBefore (sortCallRecords records) = true := by
  induction records with
  | nil => rfl
  | cons record rest ih => exact orderedBy_insertCallRecord record _ ih

/-- Reversed distinct keys fail the runtime order check until the actual sorter corrects them. -/
theorem sortCallRecords_repairs_reversed_pair (first second : CalledProcessOccurrence)
    (precedes : callRecordBefore first second = true) :
    orderedBy callRecordBefore [second, first] = false ∧
      sortCallRecords [second, first] = [first, second] := by
  have reverse := callRecordBefore_asymm first second precedes
  simp [orderedBy, sortCallRecords, insertCallRecord, precedes, reverse]

end BpmnSemantics.SemanticProcess
