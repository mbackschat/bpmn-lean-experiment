module

public import Kernel.State.Issue
public import Kernel.Laws.State.Key
import all Kernel.State.Issue

/-! # Laws of the kernel state: committed key forms (DC12)

What `Kernel.State.Issue` computes of a key: a scope occurrence key is fresh exactly when its innermost segment is
(`fresh_cons`), and an occurrence key when its ordinal or its scope occurrence key is (`OccurrenceId.fresh_eq`).
Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.State

open Kernel

@[simp] theorem fresh_cons (segment : ScopeSegment) (rest : List ScopeSegment) :
    (ScopeOccurrenceId.ofSegments (segment :: rest)).fresh = segment.ordinal.isFresh := by
  simp only [ScopeOccurrenceId.fresh, ScopeOccurrenceId.ofSegments_segments]

@[simp] theorem fresh_nil : (ScopeOccurrenceId.ofSegments []).fresh = false := by
  simp only [ScopeOccurrenceId.fresh, ScopeOccurrenceId.ofSegments_segments]

theorem OccurrenceId.fresh_eq (id : OccurrenceId) : id.fresh = (id.ordinal.isFresh || id.scope.fresh) := by
  simp only [OccurrenceId.fresh]

end Kernel.Laws.State
