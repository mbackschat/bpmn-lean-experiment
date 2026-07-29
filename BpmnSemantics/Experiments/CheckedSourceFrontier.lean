import BpmnSemantics.Experiments.CheckedSourceTransition
import BpmnSemantics.Experiments.CheckedSourceGraph

/-! # Single-token checked-source frontiers

This module owns order-independent facts about enabled checked-source transitions at a single Sequence Flow token, plus the generic distinct-key and `filterMap` isolation laws used by that account. It bridges the graph and transition vocabularies without depending on structured decomposition or parser state.
-/

namespace BpmnSemantics.Experiments.CheckedSourceFrontier

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.Experiments.CheckedSourceAdmission
open BpmnSemantics.Experiments.CheckedSourceSemantics

private theorem targetIds_eq_map (flows : List CheckedSequenceFlow) (id : NodeId) :
    (flows.filterMap fun flow =>
        if flow.targetId = id then some flow.id else none) =
      (flows.filter fun flow => decide (flow.targetId = id)).map (·.id) := by
  induction flows with
  | nil => rfl
  | cons flow rest ih => by_cases hit : flow.targetId = id <;> simp [hit, ih]

private theorem sourceIds_eq_map (flows : List CheckedSequenceFlow) (id : NodeId) :
    (flows.filterMap fun flow =>
        if flow.sourceId = id then some flow.id else none) =
      (flows.filter fun flow => decide (flow.sourceId = id)).map (·.id) := by
  induction flows with
  | nil => rfl
  | cons flow rest ih => by_cases hit : flow.sourceId = id <;> simp [hit, ih]

/-- The transition vocabulary and graph vocabulary select the same incoming flows. -/
theorem incomingFlowIds_eq (source : CheckedProcess) (id : NodeId) :
    incomingFlowIds source id = (incomingFlows source id).map (·.id) :=
  targetIds_eq_map source.sequenceFlows id

/-- The transition vocabulary and graph vocabulary select the same outgoing flows. -/
theorem outgoingFlowIds_eq (source : CheckedProcess) (id : NodeId) :
    outgoingFlowIds source id = (outgoingFlows source id).map (·.id) :=
  sourceIds_eq_map source.sequenceFlows id

private theorem allDistinct_cons {α} [DecidableEq α] (item : α) (rest : List α)
    (distinct : allDistinct (item :: rest) = true) :
    rest.contains item = false ∧ allDistinct rest = true := by
  simp only [allDistinct, Bool.and_eq_true, Bool.not_eq_true'] at distinct
  exact distinct

/-- Distinct keys make the key function injective on list members. -/
theorem key_injective_on_members {α β} [DecidableEq β] (key : α → β) :
    ∀ (items : List α), allDistinct (items.map key) = true →
      ∀ left ∈ items, ∀ right ∈ items, key left = key right → left = right := by
  intro items
  induction items with
  | nil => intro _ left member; cases member
  | cons item rest ih =>
      intro distinct left leftMember right rightMember keysEqual
      obtain ⟨notMember, restDistinct⟩ := allDistinct_cons _ _ (by simpa using distinct)
      have absent : ∀ other ∈ rest, key other ≠ key item := by
        intro other otherMember keyEqual
        exact absurd (List.mem_map.mpr ⟨other, otherMember, keyEqual⟩)
          (by simpa using notMember)
      rcases List.mem_cons.mp leftMember with rfl | leftRest
      · rcases List.mem_cons.mp rightMember with rfl | rightRest
        · rfl
        · exact absurd keysEqual.symm (absent right rightRest)
      · rcases List.mem_cons.mp rightMember with rfl | rightRest
        · exact absurd keysEqual (absent left leftRest)
        · exact ih restDistinct left leftRest right rightRest keysEqual

/-- If all differently keyed members yield `none`, `filterMap` isolates the anchor independently of list order. -/
theorem filterMap_isolated {α β γ} [DecidableEq γ] (key : α → γ)
    (predicate : α → Option β) (anchor : α) :
    ∀ items : List α, anchor ∈ items → allDistinct (items.map key) = true →
      (∀ item ∈ items, key item ≠ key anchor → predicate item = none) →
      items.filterMap predicate = (predicate anchor).toList := by
  intro items
  induction items with
  | nil => intro member; cases member
  | cons item rest ih =>
      intro member distinct miss
      obtain ⟨notMember, restDistinct⟩ := allDistinct_cons _ _ (by simpa using distinct)
      by_cases sameKey : key item = key anchor
      · have anchorIsItem : anchor = item := by
          rcases List.mem_cons.mp member with equal | anchorRest
          · exact equal
          · exact absurd (List.mem_map.mpr ⟨anchor, anchorRest, sameKey.symm⟩)
              (by simpa using notMember)
        subst anchorIsItem
        have restEmpty : rest.filterMap predicate = [] := by
          apply List.filterMap_eq_nil_iff.mpr
          intro other otherMember
          refine miss other (List.mem_cons_of_mem _ otherMember) ?_
          intro keyEqual
          exact absurd (List.mem_map.mpr ⟨other, otherMember, keyEqual⟩)
            (by simpa using notMember)
        cases result : predicate anchor <;> simp [result, restEmpty]
      · have itemNone : predicate item = none :=
          miss item List.mem_cons_self sameKey
        have anchorInRest : anchor ∈ rest := by
          rcases List.mem_cons.mp member with equal | anchorRest
          · exact absurd (congrArg key equal) (Ne.symm sameKey)
          · exact anchorRest
        rw [List.filterMap_cons, itemNone]
        exact ih anchorInRest restDistinct
          (fun other otherMember => miss other (List.mem_cons_of_mem _ otherMember))

/-- The graph facts needed to isolate an enabled node at a single-token frontier. -/
structure FrontierGraphFacts (source : CheckedProcess) : Prop where
  nodeIdsDistinct : allDistinct (source.nodes.map (·.id)) = true
  flowIdsDistinct : allDistinct (source.sequenceFlows.map (·.id)) = true
  arityValid : ∀ node ∈ source.nodes, nodeArityValid source node = true

/-- Extract the required identifier and arity facts from the executable graph validator. -/
theorem sourceGraphFacts (source : CheckedProcess)
    (wellFormed : sourceGraphWellFormed source = true) :
    FrontierGraphFacts source := by
  unfold sourceGraphWellFormed at wellFormed
  split at wellFormed
  · simp only [Bool.and_eq_true, List.all_eq_true] at wellFormed
    obtain ⟨⟨⟨⟨⟨⟨nodeIds, flowIds⟩, _⟩, arity⟩, _⟩, _⟩, _⟩ := wellFormed
    exact ⟨nodeIds, flowIds, fun node member => arity node member⟩
  · simp at wellFormed

private theorem hasToken_off_frontier (state : SourceRuntimeState)
    (tokenId other : SequenceFlowId) (single : state.tokens = [tokenId])
    (distinct : other ≠ tokenId) : hasToken state other = false := by
  simp [hasToken, tokenMultiplicity, single, Ne.symm distinct]

private theorem incomingHasNoToken (source : CheckedProcess)
    (state : SourceRuntimeState) (flow : CheckedSequenceFlow) (nodeId : NodeId)
    (flowIds : allDistinct (source.sequenceFlows.map (·.id)) = true)
    (flowMember : flow ∈ source.sequenceFlows)
    (offFrontier : nodeId ≠ flow.targetId)
    (singleToken : state.tokens = [flow.id]) :
    ∀ incoming ∈ incomingFlows source nodeId, hasToken state incoming.id = false := by
  intro incoming member
  rw [incomingFlows, List.mem_filter] at member
  obtain ⟨incomingMember, targets⟩ := member
  have targetsEq : incoming.targetId = nodeId := by simpa using targets
  refine hasToken_off_frontier state flow.id incoming.id singleToken ?_
  intro identical
  have same : incoming = flow :=
    key_injective_on_members (·.id) source.sequenceFlows flowIds incoming
      incomingMember flow flowMember identical
  exact offFrontier (by rw [← targetsEq, same])

private theorem firstIncomingDisabled (source : CheckedProcess)
    (state : SourceRuntimeState) (nodeId : NodeId)
    (noToken : ∀ incoming ∈ incomingFlows source nodeId,
      hasToken state incoming.id = false)
    (single : (incomingFlows source nodeId).length = 1) :
    hasToken state (firstFlowId (incomingFlowIds source nodeId)) = false := by
  obtain ⟨incoming, listEq⟩ := List.length_eq_one_iff.mp single
  rw [incomingFlowIds_eq, listEq]
  exact noToken incoming (by rw [listEq]; exact List.mem_cons_self)

private theorem allIncomingDisabled (source : CheckedProcess)
    (state : SourceRuntimeState) (nodeId : NodeId)
    (noToken : ∀ incoming ∈ incomingFlows source nodeId,
      hasToken state incoming.id = false)
    (two : (incomingFlows source nodeId).length = 2) :
    (incomingFlowIds source nodeId).all (hasToken state) = false := by
  rw [incomingFlowIds_eq]
  cases listEq : incomingFlows source nodeId with
  | nil => rw [listEq] at two; simp at two
  | cons head tail =>
      have headDisabled : hasToken state head.id = false :=
        noToken head (by rw [listEq]; exact List.mem_cons_self)
      simp [headDisabled]

/-- Every checked node away from the token's target is disabled, independently of node order. -/
theorem disabledOffFrontier (source : CheckedProcess) (state : SourceRuntimeState)
    (flow : CheckedSequenceFlow) (candidate : CheckedNode)
    (wellFormed : sourceGraphWellFormed source = true)
    (flowMember : flow ∈ source.sequenceFlows)
    (candidateMember : candidate ∈ source.nodes)
    (offFrontier : candidate.id ≠ flow.targetId)
    (singleToken : state.tokens = [flow.id])
    (notPending : state.initiationPending = false) :
    fireNode? source candidate state = none := by
  have facts := sourceGraphFacts source wellFormed
  have candidateArity := facts.arityValid candidate candidateMember
  have noToken := incomingHasNoToken source state flow candidate.id facts.flowIdsDistinct
    flowMember offFrontier singleToken
  cases candidate with
  | noneStartEvent id => simp [fireNode?, notPending]
  | intermediateCatchTimerEvent id duration => rfl
  | serviceTask id implementation binding inputs outputs route => rfl
  | userTask id name =>
      simp only [nodeArityValid, Bool.and_eq_true, decide_eq_true_eq] at candidateArity
      have disabled := firstIncomingDisabled source state id noToken candidateArity.1
      cases control : state.control <;> simp [fireNode?, control, disabled]
  | noneEndEvent id =>
      simp only [nodeArityValid, Bool.and_eq_true, decide_eq_true_eq] at candidateArity
      have disabled := firstIncomingDisabled source state id noToken candidateArity.1
      cases control : state.control <;> simp [fireNode?, control, disabled]
  | parallelGateway id direction =>
      cases direction with
      | diverging =>
          simp only [nodeArityValid, Bool.and_eq_true, decide_eq_true_eq] at candidateArity
          simp [fireNode?,
            firstIncomingDisabled source state id noToken candidateArity.1]
      | converging =>
          simp only [nodeArityValid, Bool.and_eq_true, decide_eq_true_eq] at candidateArity
          simp [fireNode?, allIncomingDisabled source state id noToken candidateArity.1]

/-- At a single-token frontier, the enabled-transition list is exactly the contribution of the targeted node. The graph and runtime-shape premises contain no parser result, selector result, or collection-order constraint. -/
theorem enabledTransitionsAtSingleToken (source : CheckedProcess)
    (state : SourceRuntimeState) (flow : CheckedSequenceFlow) (node : CheckedNode)
    (wellFormed : sourceGraphWellFormed source = true)
    (flowMember : flow ∈ source.sequenceFlows)
    (nodeMember : node ∈ source.nodes)
    (nodeIsTarget : node.id = flow.targetId)
    (singleToken : state.tokens = [flow.id])
    (notPending : state.initiationPending = false) :
    enabledTransitions source state =
      ((fireNode? source node state).map fun successor => (node, successor)).toList := by
  have facts := sourceGraphFacts source wellFormed
  have miss : ∀ candidate ∈ source.nodes, candidate.id ≠ node.id →
      (fun candidate => (fireNode? source candidate state).map
        fun successor => (candidate, successor)) candidate = none := by
    intro candidate candidateMember differs
    show ((fireNode? source candidate state).map
      fun successor => (candidate, successor)) = none
    rw [disabledOffFrontier source state flow candidate wellFormed flowMember
      candidateMember (by rw [← nodeIsTarget]; exact differs) singleToken notPending]
    rfl
  rw [enabledTransitions,
    filterMap_isolated (·.id) _ node source.nodes nodeMember facts.nodeIdsDistinct miss]

end BpmnSemantics.Experiments.CheckedSourceFrontier
