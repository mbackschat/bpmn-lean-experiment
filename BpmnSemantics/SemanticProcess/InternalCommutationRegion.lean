import BpmnSemantics.SemanticProcess.InternalCommutationCore

/-! # Internal commutation occurrence regions

This module derives the exact pre-state occurrence ownership closure used by destructive internal
transition footprints. Scope-parent edges and caller-to-called-root edges are directional. The
classification applies no transition and proves no commutation theorem by itself.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

structure InternalOccurrenceRegion where
  root : ScopeOccurrenceId
  members : List ScopeOccurrenceId
  deriving Repr, DecidableEq

private def exactScopeOccurrenceCount (state : RuntimeState)
    (id : ScopeOccurrenceId) : Bool :=
  (state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = id)).length == 1

private def scopeOwnershipGraphExact (state : RuntimeState) : Bool :=
  decide (state.scopeOccurrences.map (·.id)).Nodup &&
    state.scopeOccurrences.all (fun occurrence =>
      match occurrence.parent with
      | none => true
      | some parent =>
          exactScopeOccurrenceCount state parent && decide (parent ≠ occurrence.id)) &&
    state.calledProcessOccurrences.all (fun record =>
      exactScopeOccurrenceCount state record.caller &&
        (state.scopeOccurrences.filter fun occurrence =>
          decide (occurrence.id = record.calledRoot) && occurrence.parent.isNone).length == 1)

private def canonicalScopeMembers (members : List ScopeOccurrenceId) :
    List ScopeOccurrenceId :=
  sortBy scopeBefore members.eraseDups

private def expandOccurrenceRegionMembers (state : RuntimeState)
    (members : List ScopeOccurrenceId) : List ScopeOccurrenceId :=
  canonicalScopeMembers
    (members ++
      (state.scopeOccurrences.filterMap fun occurrence =>
        match occurrence.parent with
        | some parent => if members.contains parent then some occurrence.id else none
        | none => none) ++
      state.calledProcessOccurrences.filterMap fun record =>
        if members.contains record.caller then some record.calledRoot else none)

private def occurrenceRegionMembersWithin (state : RuntimeState)
    (members : List ScopeOccurrenceId) : Nat → List ScopeOccurrenceId
  | 0 => canonicalScopeMembers members
  | fuel + 1 =>
      let expanded := expandOccurrenceRegionMembers state members
      if expanded.length = members.length then expanded
      else occurrenceRegionMembersWithin state expanded fuel

def deriveInternalOccurrenceRegion? (state : RuntimeState)
    (root : ScopeOccurrenceId) : Option InternalOccurrenceRegion :=
  if !scopeOwnershipGraphExact state then none
  else
    match state.scopeOccurrences.filter fun occurrence => decide (occurrence.id = root) with
    | [occurrence] =>
        some
          { root := occurrence.id
            members := occurrenceRegionMembersWithin state [occurrence.id]
              (state.scopeOccurrences.length + 1) }
    | _ => none

def InternalOccurrenceRegion.contains (region : InternalOccurrenceRegion)
    (candidate : ScopeOccurrenceId) : Bool :=
  region.members.contains candidate

def occurrenceRegionsOverlap (left right : InternalOccurrenceRegion) : Bool :=
  left.members.any right.contains

/-- A Call association is jointly owned by its caller and called root. -/
def InternalOccurrenceRegion.ownsCall (region : InternalOccurrenceRegion)
    (record : CalledProcessOccurrence) : Bool :=
  region.contains record.caller || region.contains record.calledRoot

/-- Creating a child depends on its live parent and conflicts with removing that parent's region. -/
def InternalOccurrenceRegion.ownsInsertion (region : InternalOccurrenceRegion)
    (parent : ScopeOccurrenceId) : Bool :=
  region.contains parent

end InternalCommutation

end BpmnSemantics.SemanticProcess
