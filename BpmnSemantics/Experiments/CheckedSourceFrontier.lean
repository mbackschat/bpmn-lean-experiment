import BpmnSemantics.Experiments.CheckedSourceTransition
import BpmnSemantics.Experiments.CheckedSourceGraph

/-! # Shared checked-source frontier laws and single-token frontiers

This module owns two things. First, the frontier laws that are independent of how many tokens a state carries: the graph/transition vocabulary bridges, the generic distinct-key and `filterMap` isolation laws, the extracted graph identifier and arity facts, permutation-aware token absence in `incomingUntokened`, and arity-based node disabling in `nodeDisabled`. Second, the order-independent characterization of enabled checked-source transitions at a single Sequence Flow token, built from those laws.

`incomingUntokened` and `nodeDisabled` are quantified over an arbitrary token list and are consumed by the two-token account in `CheckedSourceParallelFrontier` as well as by the single-token account here. A frontier stage at any other token count extends these shared laws instead of re-deriving them.

Nothing here depends on structured decomposition or parser state.
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

private theorem untokenedCount (other : SequenceFlowId) :
    ∀ tokens : List SequenceFlowId, other ∉ tokens →
      (tokens.filter fun token => decide (token = other)).length = 0
  | [], _ => rfl
  | token :: rest, absent => by
      have headDiffers : ¬ token = other := fun equal =>
        absent (equal ▸ List.mem_cons_self)
      have restAbsent : other ∉ rest := fun member =>
        absent (List.mem_cons_of_mem _ member)
      simp [headDiffers, untokenedCount other rest restAbsent]

/-- A Sequence Flow absent from a permutation-equivalent token list carries no token. -/
private theorem hasToken_absent (state : SourceRuntimeState)
    (tokens : List SequenceFlowId) (perm : state.tokens.Perm tokens)
    (other : SequenceFlowId) (absent : other ∉ tokens) :
    hasToken state other = false := by
  have counts := (perm.filter fun token => decide (token = other)).length_eq
  simp [hasToken, tokenMultiplicity, counts, untokenedCount other tokens absent]

/-- Every incoming Flow of a node that no listed token Flow targets is untokened. -/
theorem incomingUntokened (source : CheckedProcess) (state : SourceRuntimeState)
    (tokenedFlows : List CheckedSequenceFlow) (nodeId : NodeId)
    (flowIds : allDistinct (source.sequenceFlows.map (·.id)) = true)
    (tokenedMember : ∀ flow ∈ tokenedFlows, flow ∈ source.sequenceFlows)
    (offFrontier : ∀ flow ∈ tokenedFlows, nodeId ≠ flow.targetId)
    (perm : state.tokens.Perm (tokenedFlows.map (·.id))) :
    ∀ incoming ∈ incomingFlows source nodeId, hasToken state incoming.id = false := by
  intro incoming member
  rw [incomingFlows, List.mem_filter] at member
  obtain ⟨incomingMember, targets⟩ := member
  have targetsEq : incoming.targetId = nodeId := by simpa using targets
  refine hasToken_absent state _ perm incoming.id ?_
  intro listed
  obtain ⟨tokened, tokenedMemberOf, idEq⟩ := List.mem_map.mp listed
  have same : incoming = tokened :=
    key_injective_on_members (·.id) source.sequenceFlows flowIds incoming
      incomingMember tokened (tokenedMember tokened tokenedMemberOf) idEq.symm
  exact offFrontier tokened tokenedMemberOf (by rw [← targetsEq, same])

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

/-- A checked node with valid arity, no incoming token, and settled initiation cannot fire. Settled initiation is load-bearing rather than defensive: a none Start Event fires from the pending-initiation flag and not from an incoming token, so the arity and token premises alone do not disable it. -/
theorem nodeDisabled (source : CheckedProcess) (state : SourceRuntimeState)
    (candidate : CheckedNode)
    (candidateArity : nodeArityValid source candidate = true)
    (noToken : ∀ incoming ∈ incomingFlows source candidate.id,
      hasToken state incoming.id = false)
    (notPending : state.initiationPending = false) :
    fireNode? source candidate state = none := by
  cases candidate with
  | noneStartEvent id => simp [fireNode?, notPending]
  | intermediateCatchTimerEvent id duration => rfl
  | intermediateCatchMessageEvent id channel => rfl
  | serviceTask id descriptor inputs outputs route => rfl
  | exclusiveGateway id candidateFlowIds defaultFlowId =>
      simp [nodeArityValid] at candidateArity
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
  refine nodeDisabled source state candidate
    (facts.arityValid candidate candidateMember) ?_ notPending
  refine incomingUntokened source state [flow] candidate.id facts.flowIdsDistinct
    ?_ ?_ (by simp [singleToken])
  · intro other member
    rcases List.mem_cons.mp member with rfl | member
    · exact flowMember
    · cases member
  · intro other member
    rcases List.mem_cons.mp member with rfl | member
    · exact offFrontier
    · cases member

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
