import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProjectionShapeProofs
import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycleOrder

/-! Instantaneous publication preserves the independently projected open occurrence set.
The lifecycle fold owns both freshness and same-delta closure.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private theorem insertBy_append_last (before : α → α → Bool)
    (value last : α) (values : List α) (earlier : before value last = true) :
    insertBy before value (values ++ [last]) = insertBy before value values ++ [last] := by
  induction values with
  | nil => simp [insertBy, earlier]
  | cons head rest ih =>
      simp only [insertBy]
      by_cases order : before value head <;> simp [List.cons_append, insertBy, order, ih]

private theorem sortBy_append_last (before : α → α → Bool) (last : α)
    (values : List α) (earlier : ∀ value ∈ values, before value last = true) :
    sortBy before (values ++ [last]) = sortBy before values ++ [last] := by
  induction values with
  | nil => simp [sortBy, insertBy]
  | cons head rest ih =>
      simp only [List.cons_append, sortBy]
      rw [ih (fun value member => earlier value (by simp [member]))]
      exact insertBy_append_last before head last _ (earlier head (by simp))

theorem projectOpenFlowNodeOccurrences_sorted (program : Program) (state : RuntimeState)
    (projected : List OpenSemanticFlowNodeOccurrence)
    (selected : projectOpenFlowNodeOccurrences? program state = some projected) :
    sortFlowNodeOccurrenceStarts projected = projected := by
  unfold projectOpenFlowNodeOccurrences? at selected
  cases controlEq : state.control <;> simp_all <;> try rfl
  case running =>
    obtain ⟨_, selected⟩ := selected
    obtain ⟨waits, _, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨scopes, _, selected⟩ := Option.bind_eq_some_iff.mp selected
    obtain ⟨calls, _, selected⟩ := Option.bind_eq_some_iff.mp selected
    split at selected
    · simp at selected
      subst projected
      exact sortFlowNodeOccurrenceStarts_perm_eq (sortFlowNodeOccurrenceStarts_perm _)
    · simp at selected

theorem applyFlowNodeOccurrenceDelta_instantaneous (current : List OpenSemanticFlowNodeOccurrence)
    (identity : FlowNodeIdentity) (commandId : SemanticId) (transitionIndex : Nat)
    (nodup : (current.map (·.anchor)).Nodup)
    (noTransition : ¬ ∃ start, start ∈ current ∧ transitionAnchor start.anchor = true)
    (sorted : sortFlowNodeOccurrenceStarts current = current) :
    applyFlowNodeOccurrenceDelta? current
      (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity]) = some current := by
  let anchor := SemanticFlowNodeOccurrenceAnchor.transition commandId transitionIndex 0
  let start : UnnumberedFlowNodeOccurrenceStart :=
    { anchor, processId := identity.processId, elementId := identity.elementId, owner := identity.owner }
  have deltaEq : instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity] =
      { started := [start], ended := [{ anchor, terminal := .completed }] } := rfl
  have fresh : ∀ occurrence ∈ current, occurrence.anchor ≠ anchor := by
    intro occurrence member same
    exact noTransition ⟨occurrence, member, by rw [same]; rfl⟩
  have freshNodup : ((current ++ [start]).map (·.anchor)).Nodup := by
    simpa [List.map_append, List.nodup_append, start] using And.intro nodup fresh
  have containsStart : ((sortFlowNodeOccurrenceStarts (current ++ [start])).map (·.anchor)).contains anchor = true := by
    simp only [List.contains_iff_mem, List.mem_map]
    exact ⟨start, (mem_sortFlowNodeOccurrenceStarts _ _).2 (by simp), rfl⟩
  have filterCurrent : current.filter (fun occurrence => occurrence.anchor != anchor) = current := by
    apply List.filter_eq_self.mpr
    intro occurrence member
    simpa using fresh occurrence member
  have removed : removeEndedFlowNodeOccurrences (sortFlowNodeOccurrenceStarts (current ++ [start]))
      [{ anchor, terminal := .completed }] = current := by
    have earlier : ∀ occurrence ∈ current, startBefore occurrence start = true := by
      intro occurrence member
      have regular : transitionAnchor occurrence.anchor = false :=
        Bool.eq_false_iff.mpr (fun transition => noTransition ⟨occurrence, member, transition⟩)
      cases anchorEq : occurrence.anchor <;>
        simp_all [transitionAnchor, startBefore, start, anchor, flowNodeOccurrenceAnchorBefore]
    have available : sortFlowNodeOccurrenceStarts (current ++ [start]) = current ++ [start] :=
      (sortBy_append_last startBefore start current earlier).trans (congrArg (· ++ [start]) sorted)
    rw [available]
    simpa [removeEndedFlowNodeOccurrences, List.filter_append, start] using filterCurrent
  have noRemaining : (current.any fun occurrence => transitionAnchor occurrence.anchor) = false := by
    simpa [List.any_eq_true] using noTransition
  rw [deltaEq]
  simp only [applyFlowNodeOccurrenceDelta?, availableAfterStarts, freshNodup, decide_true,
    Bool.not_true, List.map_cons, List.map_nil, List.nodup_cons, List.not_mem_nil,
    List.nodup_nil, List.all_cons, List.all_nil, containsStart, Bool.and_self]
  simp only [start, anchor, transitionAnchor, List.filter_cons, List.filter_nil,
    List.all_cons, List.all_nil, List.contains_cons,
    beq_self_eq_true, List.contains_nil, Bool.or_false, Bool.and_true, Bool.not_true,
    Bool.false_eq_true, ↓reduceIte]
  change (if (removeEndedFlowNodeOccurrences (sortFlowNodeOccurrenceStarts (current ++ [start]))
    [{ anchor, terminal := .completed }]).any (fun occurrence => transitionAnchor occurrence.anchor)
    then none else some (removeEndedFlowNodeOccurrences (sortFlowNodeOccurrenceStarts (current ++ [start]))
      [{ anchor, terminal := .completed }])) = some current
  rw [removed, noRemaining]
  rfl

theorem instantaneous_reused_anchor_refused (current : List OpenSemanticFlowNodeOccurrence)
    (identity : FlowNodeIdentity) (commandId : SemanticId) (transitionIndex : Nat)
    (present : SemanticFlowNodeOccurrenceAnchor.transition commandId transitionIndex 0 ∈
      current.map (·.anchor)) :
    applyFlowNodeOccurrenceDelta? current
      (instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity]) = none := by
  have deltaEq : instantaneousFlowNodeOccurrenceDelta commandId transitionIndex [identity] =
      { started := [{ anchor := .transition commandId transitionIndex 0,
                      processId := identity.processId, elementId := identity.elementId, owner := identity.owner }],
        ended := [{ anchor := .transition commandId transitionIndex 0, terminal := .completed }] } := rfl
  rw [deltaEq]
  simp [applyFlowNodeOccurrenceDelta?, List.map_append, List.nodup_append]
  intro _ fresh
  obtain ⟨occurrence, member, same⟩ := List.mem_map.mp present
  exact False.elim (fresh occurrence member same)

theorem instantaneous_unclosed_start_refused (current : List OpenSemanticFlowNodeOccurrence)
    (identity : FlowNodeIdentity) (commandId : SemanticId) (transitionIndex : Nat) :
    applyFlowNodeOccurrenceDelta? current
      { started := [{ anchor := .transition commandId transitionIndex 0,
                      processId := identity.processId, elementId := identity.elementId, owner := identity.owner }],
        ended := [] } = none := by
  simp [applyFlowNodeOccurrenceDelta?, transitionAnchor]

end BpmnSemantics.SemanticProcess
