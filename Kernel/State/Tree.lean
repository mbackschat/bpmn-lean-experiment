module

public import Kernel.State

/-! # The scope tree

What lies inside a scope occurrence (`State.subtree`), read from the structural keys (KD1): a key lies below another
when that one is a proper tail of it. Part of the State layer, above `Kernel.State`; `Kernel.State.Removal` re-exports it
to `Kernel.Hooks`.
-/

public section

namespace Kernel

namespace State

/-- Whether the key `inner` lies strictly below the key `outer`: `outer` is a proper tail of it. -/
def below (outer : List ScopeSegment) : List ScopeSegment → Bool
  | [] => false
  | _ :: rest => rest == outer || below outer rest

/-- The places in `state.scopes` of the scope occurrences on `inner`'s key below the key `outer`, outermost first. -/
def ranks (state : State) (outer : List ScopeSegment) : List ScopeSegment → List Nat
  | [] => []
  | segment :: rest =>
    if segment :: rest == outer then [] else ranks state outer rest ++ [state.scopes.findIdx (·.id == ⟨segment :: rest⟩)]

/-- The scope occurrences inside `scope`, transitively, including `scope`, the deepest last: breadth first, each level
in the order of its parents and then of entry, which is the order of their places on the way down (`ranks`), shorter
first. The journal of a clearing reads this order (`clearInside`). -/
def subtree (state : State) (scope : ScopeOccurrenceId) : List ScopeOccurrenceId :=
  let inside := (state.scopes.filter fun entry => below scope.segments entry.id.segments).map
    fun entry => (state.ranks scope.segments entry.id.segments, entry.id)
  scope :: (inside.mergeSort fun a b => (compareLex (compareOn List.length) compare a.1 b.1).isLE).map (·.2)

end State

end Kernel
