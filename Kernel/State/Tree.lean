module

public import Kernel.State

/-! # The scope tree

What lies inside a scope occurrence, read from the structural keys (KD1): a key lies below another when that one is a
proper tail of it. `State.inside` is the set the membership readers ask; `State.subtree` the same scope occurrences in
the order a clearing journals them, by their order positions (DC25). Part of the State layer, above `Kernel.State`; `Kernel.State.Removal` re-exports it
to `Kernel.Hooks`.
-/

public section

namespace Kernel

namespace State

/-- Whether the key `inner` lies strictly below the key `outer`: `outer` is a proper tail of it. -/
def below (outer : List ScopeSegment) : List ScopeSegment → Bool
  | [] => false
  | _ :: rest => rest == outer || below outer rest

/-- The scope occurrences inside `scope`, transitively, including `scope`, in no order a reader may rely on: the
readers that only ask whether a scope occurrence lies inside read this. -/
def inside (state : State) (scope : ScopeOccurrenceId) : List ScopeOccurrenceId :=
  scope :: (state.scopes.filter fun entry => below scope.segments entry.id.segments).map (·.id)

/-- The order positions of the scope occurrences on `inner`'s key below the key `outer`, outermost first. A key no
standing scope occurrence holds ranks as the root does; in a well-formed state every key between two standing ones
stands. -/
def ranks (state : State) (outer : List ScopeSegment) : List ScopeSegment → List Issue
  | [] => []
  | segment :: rest =>
    if segment :: rest == outer then []
    else ranks state outer rest ++ [((state.scopes.find? (·.id.segments == segment :: rest)).map (·.position)).getD 0]

/-- Whether the ranks `a` come no later than the ranks `b` of the same length under the position order `le`: position
by position, the first that differs deciding. -/
def ranksNotAfter (le : Issue → Issue → Bool) : List Issue → List Issue → Bool
  | [], _ => true
  | _ :: _, [] => false
  | a :: as, b :: bs => le a b && (!le b a || ranksNotAfter le as bs)

/-- The scope occurrences inside `scope`, transitively, including `scope`, the deepest last: breadth first, each level
in the order of its parents and then of its own order positions under `le` (`ranks`), shorter first. The journal of a
clearing reads this order (`clearInside`). -/
def subtree (state : State) (le : Issue → Issue → Bool) (scope : ScopeOccurrenceId) : List ScopeOccurrenceId :=
  let inside := (state.scopes.filter fun entry => below scope.segments entry.id.segments).map
    fun entry => (state.ranks scope.segments entry.id.segments, entry.id)
  scope :: (inside.mergeSort fun a b =>
    a.1.length < b.1.length || (a.1.length == b.1.length && ranksNotAfter le a.1 b.1)).map (·.2)

end State

end Kernel
