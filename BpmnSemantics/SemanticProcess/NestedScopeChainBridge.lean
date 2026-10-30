module

public import BpmnSemantics.SemanticProcess.NestedScopeData
import all BpmnSemantics.SemanticProcess.NestedScopeData
meta import BpmnSemantics.PrivateEquationLemmas

/-! # Occurrence-chain bridge

The `CSD-CHAIN-01` bridge of the
[concurrent scope data proposal](../../docs/capsules/CONCURRENT-SCOPE-DATA-PROPOSAL.md#lean-assurance-lane):
under its three premises the live occurrence chain names the same frames as the definition chain that
nested scope data resolved over before concurrent activations, so moving resolution onto occurrences
changes nothing for a state in which every chain definition is activated once.

The definition-chain walk survives here only as that reference account; no runtime operation uses it.
-/

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`occurrenceChainWithin, `resolveOwner?]

public section

namespace BpmnSemantics.SemanticProcess.NestedScopeData

open BpmnSemantics

def parentScope? (scopes : List DefinitionScope) (scopeId : DefinitionScopeId) : Option DefinitionScopeId :=
  match scopes.filter (·.id == scopeId) with
  | [scope] => scope.parentScopeId
  | _ => none

run_meta privateMatchEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`parentScope?]

/-- `scopeId` and its ancestors, innermost first; the fuel bound terminates a cyclic parent relation. -/
def chainWithin (scopes : List DefinitionScope) : Nat → DefinitionScopeId → List DefinitionScopeId
  | 0, _ => []
  | fuel + 1, scopeId => scopeId :: match parentScope? scopes scopeId with
      | some parent => chainWithin scopes fuel parent
      | none => []

def definitionChain (scopes : List DefinitionScope) (scopeId : DefinitionScopeId) : List DefinitionScopeId :=
  chainWithin scopes scopes.length scopeId

def framesOf (scopes : List ScopeVariableScope) (instanceId : SemanticId) (scopeId : DefinitionScopeId) :
    List ScopeVariableScope :=
  scopes.filter fun frame =>
    frame.owner.processInstanceId == instanceId && frame.owner.definitionScopeId == scopeId

/-- The reference account: the nearest chain definition whose frame in the instance declares `name`. -/
private def definitionResolveOwner? (scopes : List ScopeVariableScope) (instanceId : SemanticId) :
    List DefinitionScopeId → String → Option Owner
  | [], _ => some .process
  | scopeId :: rest, name =>
      match framesOf scopes instanceId scopeId with
      | [] => definitionResolveOwner? scopes instanceId rest name
      | [frame] =>
          if frame.bindings.any (·.name == name) then some (.frame frame.owner)
          else definitionResolveOwner? scopes instanceId rest name
      | _ => none

run_meta privateEquations `BpmnSemantics.SemanticProcess.NestedScopeData #[`chainWithin, `definitionChain,
  `definitionResolveOwner?]

section Walk

variable (occurrences : List RuntimeScopeOccurrence)

private theorem occurrenceChainWithin_succ : ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId),
    occurrenceChainWithin occurrences fuel owner = some chain →
    occurrenceChainWithin occurrences (fuel + 1) owner = some chain
  | 0, _, _, walked => by simp [occurrenceChainWithin] at walked
  | fuel + 1, owner, chain, walked => by
      unfold occurrenceChainWithin at walked ⊢
      split at walked
      · rename_i occurrence _
        split at walked
        · exact walked
        · rename_i parent _
          cases rest : occurrenceChainWithin occurrences fuel parent with
          | none => simp [rest] at walked
          | some tail =>
              simp only [rest, Option.map_some] at walked
              simp only [occurrenceChainWithin_succ fuel parent tail rest, Option.map_some, *]
      · contradiction

theorem occurrenceChainWithin_mono (fuel more : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (walked : occurrenceChainWithin occurrences fuel owner = some chain) :
    occurrenceChainWithin occurrences (fuel + more) owner = some chain := by
  induction more with
  | zero => exact walked
  | succ more grown => exact occurrenceChainWithin_succ occurrences _ owner chain grown

private theorem within_unique (fuel fuel' : Nat) (owner : ScopeOccurrenceId) (chain chain' : List ScopeOccurrenceId)
    (walked : occurrenceChainWithin occurrences fuel owner = some chain)
    (walked' : occurrenceChainWithin occurrences fuel' owner = some chain') : chain = chain' := by
  have left := occurrenceChainWithin_mono occurrences fuel fuel' owner chain walked
  have right := occurrenceChainWithin_mono occurrences fuel' fuel owner chain' walked'
  rw [Nat.add_comm] at right
  exact Option.some.inj (left.symm.trans right)

/-- One walk step: the head is the walked owner, which is live exactly once, and the tail is its
parent's walk, or empty at a parentless occurrence. -/
private theorem within_step : ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId),
    occurrenceChainWithin occurrences fuel owner = some chain →
    ∃ fuel' occurrence tail, fuel = fuel' + 1 ∧ chain = owner :: tail ∧
      occurrences.filter (·.id == owner) = [occurrence] ∧
      (occurrence.parent = none → tail = []) ∧
      ∀ parent, occurrence.parent = some parent → occurrenceChainWithin occurrences fuel' parent = some tail
  | 0, _, _, walked => by simp [occurrenceChainWithin] at walked
  | fuel + 1, owner, chain, walked => by
      unfold occurrenceChainWithin at walked
      split at walked
      · rename_i occurrence found
        split at walked
        · rename_i root
          cases walked
          exact ⟨fuel, occurrence, [], rfl, rfl, found, fun _ => rfl, by simp [root]⟩
        · rename_i parent linked
          cases rest : occurrenceChainWithin occurrences fuel parent with
          | none => simp [rest] at walked
          | some tail =>
              simp only [rest, Option.map_some, Option.some.injEq] at walked
              exact ⟨fuel, occurrence, tail, rfl, walked.symm, found, by simp [linked],
                fun other same => by rw [linked] at same; cases same; exact rest⟩
      · contradiction

private theorem within_suffix : ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId),
    occurrenceChainWithin occurrences fuel owner = some chain →
    ∀ member ∈ chain, ∃ fuel' suffix, occurrenceChainWithin occurrences fuel' member = some suffix ∧ suffix <:+ chain
  | fuel, owner, chain, walked, member, inside => by
      obtain ⟨fuel', occurrence, tail, rfl, rfl, _, root, linked⟩ := within_step occurrences fuel owner chain walked
      rcases List.mem_cons.mp inside with rfl | later
      · exact ⟨fuel' + 1, _, walked, List.suffix_refl _⟩
      · cases parented : occurrence.parent with
        | none => simp [root parented] at later
        | some parent =>
            obtain ⟨found, suffix, reached, isSuffix⟩ :=
              within_suffix fuel' parent tail (linked parent parented) member later
            exact ⟨found, suffix, reached, isSuffix.trans (List.suffix_cons _ _)⟩

private theorem within_nodup : ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId),
    occurrenceChainWithin occurrences fuel owner = some chain → chain.Nodup
  | fuel, owner, chain, walked => by
      obtain ⟨fuel', occurrence, tail, rfl, rfl, _, root, linked⟩ := within_step occurrences fuel owner chain walked
      cases parented : occurrence.parent with
      | none => simp [root parented]
      | some parent =>
          have rest := linked parent parented
          refine List.nodup_cons.mpr ⟨fun repeated => ?_, within_nodup fuel' parent tail rest⟩
          obtain ⟨found, suffix, again, isSuffix⟩ := within_suffix occurrences fuel' parent tail rest owner repeated
          have same := within_unique occurrences _ _ owner _ _ walked again
          have shorter : (owner :: tail).length ≤ tail.length := same ▸ isSuffix.length_le
          simp only [List.length_cons] at shorter
          omega

/-- Every chain member is the identity of a live occurrence. -/
private theorem within_live : ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain : List ScopeOccurrenceId),
    occurrenceChainWithin occurrences fuel owner = some chain →
    ∀ member ∈ chain, ∃ occurrence ∈ occurrences, occurrence.id = member
  | fuel, owner, chain, walked, member, inside => by
      obtain ⟨fuel', occurrence, tail, rfl, rfl, found, root, linked⟩ := within_step occurrences fuel owner chain walked
      rcases List.mem_cons.mp inside with rfl | later
      · have selected : occurrence ∈ occurrences.filter (·.id == member) := by simp [found]
        simp only [List.mem_filter, beq_iff_eq] at selected
        exact ⟨occurrence, selected⟩
      · cases parented : occurrence.parent with
        | none => simp [root parented] at later
        | some parent => exact within_live fuel' parent tail (linked parent parented) member later

end Walk

/-- CSD-CHAIN-01's three premises for the chain `chain` of `reader`, each read over the chain alone:
every chain definition has exactly one live occurrence in its instance; every chain occurrence is
nested as its definition is, in the same instance, and its definition is a Program scope; every frame
is owned by a live occurrence. -/
private structure ChainBridgePremises (definitions : List DefinitionScope) (occurrences : List RuntimeScopeOccurrence)
    (frames : List ScopeVariableScope) (chain : List ScopeOccurrenceId) : Prop where
  singular : ∀ member ∈ chain, (occurrences.filter fun occurrence =>
    occurrence.id.processInstanceId == member.processInstanceId &&
      occurrence.id.definitionScopeId == member.definitionScopeId).length = 1
  nested : ∀ occurrence ∈ occurrences, occurrence.id ∈ chain →
    parentScope? definitions occurrence.id.definitionScopeId = occurrence.parent.map (·.definitionScopeId) ∧
      (∀ parent, occurrence.parent = some parent → parent.processInstanceId = occurrence.id.processInstanceId) ∧
      occurrence.id.definitionScopeId ∈ definitions.map (·.id)
  owned : ∀ frame ∈ frames, ∃ occurrence ∈ occurrences, occurrence.id = frame.owner

section Bridge

variable (definitions : List DefinitionScope) (occurrences : List RuntimeScopeOccurrence)
  (frames : List ScopeVariableScope)

/-- Under the nesting premise the walk visits only the reader's instance and its definitions are the
definition chain of the reader's definition, for every sufficient definition fuel. -/
private theorem within_definitions : ∀ (fuel : Nat) (owner : ScopeOccurrenceId) (chain whole : List ScopeOccurrenceId),
    occurrenceChainWithin occurrences fuel owner = some chain → chain <:+ whole →
    ChainBridgePremises definitions occurrences frames whole →
    (∀ member ∈ chain, member.processInstanceId = owner.processInstanceId) ∧
      ∀ budget, chain.length ≤ budget →
        chainWithin definitions budget owner.definitionScopeId = chain.map (·.definitionScopeId)
  | fuel, owner, chain, whole, walked, isSuffix, premises => by
      obtain ⟨fuel', occurrence, tail, rfl, rfl, found, root, linked⟩ := within_step occurrences fuel owner chain walked
      have selected : occurrence ∈ occurrences.filter (·.id == owner) := by simp [found]
      simp only [List.mem_filter, beq_iff_eq] at selected
      have onWhole : occurrence.id ∈ whole := by rw [selected.2]; exact isSuffix.subset List.mem_cons_self
      obtain ⟨parentScope, sameInstance, _⟩ := premises.nested occurrence selected.1 onWhole
      rw [selected.2] at parentScope sameInstance
      cases parented : occurrence.parent with
      | none =>
          rw [root parented]
          refine ⟨by simp, fun budget enough => ?_⟩
          obtain ⟨budget, rfl⟩ : ∃ rest, budget = rest + 1 := ⟨budget - 1, by simp at enough; omega⟩
          simp [chainWithin, parentScope, parented]
      | some parent =>
          obtain ⟨instances, definitionsOf⟩ := within_definitions fuel' parent tail whole (linked parent parented)
            ((List.suffix_cons owner tail).trans isSuffix) premises
          have parentInstance := sameInstance parent parented
          refine ⟨fun member inside => ?_, fun budget enough => ?_⟩
          · rcases List.mem_cons.mp inside with rfl | later
            · rfl
            · rw [instances member later, parentInstance]
          · obtain ⟨budget, rfl⟩ : ∃ rest, budget = rest + 1 := ⟨budget - 1, by simp at enough; omega⟩
            simp only [chainWithin, parentScope, parented, Option.map_some, List.map_cons]
            rw [definitionsOf budget (by simp at enough; omega)]

/-- With one live occurrence per chain definition and every frame owned by a live occurrence, the
frames of a chain occurrence are exactly the frames of its definition in the reader's instance. -/
private theorem framesAt_eq_framesOf (chain : List ScopeOccurrenceId) (instanceId : SemanticId)
    (premises : ChainBridgePremises definitions occurrences frames chain)
    (member : ScopeOccurrenceId) (inside : member ∈ chain) (live : ∃ occurrence ∈ occurrences, occurrence.id = member)
    (sameReader : member.processInstanceId = instanceId) :
    framesAt frames member = framesOf frames instanceId member.definitionScopeId := by
  unfold framesAt framesOf
  apply List.filter_congr
  intro frame framed
  obtain ⟨owner, ownerLive, ownerId⟩ := premises.owned frame framed
  obtain ⟨occurrence, occurrenceLive, occurrenceId⟩ := live
  by_cases same : frame.owner = member
  · simp [same, sameReader]
  · have unowned : (frame.owner == member) = false := by simpa using same
    rw [unowned]
    cases both : (frame.owner.processInstanceId == instanceId &&
        frame.owner.definitionScopeId == member.definitionScopeId)
    · rfl
    exfalso
    simp only [Bool.and_eq_true, beq_iff_eq] at both
    obtain ⟨sameInstance, sameDefinition⟩ := both
    have one := premises.singular member inside
    have ownerSelected : owner ∈ occurrences.filter (fun candidate =>
        candidate.id.processInstanceId == member.processInstanceId &&
          candidate.id.definitionScopeId == member.definitionScopeId) := by
      simp [ownerLive, ownerId, sameInstance, sameDefinition, sameReader]
    have occurrenceSelected : occurrence ∈ occurrences.filter (fun candidate =>
        candidate.id.processInstanceId == member.processInstanceId &&
          candidate.id.definitionScopeId == member.definitionScopeId) := by
      simp [occurrenceLive, occurrenceId]
    obtain ⟨single, singleton⟩ := List.length_eq_one_iff.mp one
    rw [singleton, List.mem_singleton] at ownerSelected occurrenceSelected
    exact same (by rw [← ownerId, ownerSelected, ← occurrenceSelected, occurrenceId])

private theorem resolveOwner?_of_frames_eq (instanceId : SemanticId) (name : String) :
    ∀ (chain : List ScopeOccurrenceId) (scopeIds : List DefinitionScopeId),
      chain.map (framesAt frames) = scopeIds.map (framesOf frames instanceId) →
      resolveOwner? frames chain name = definitionResolveOwner? frames instanceId scopeIds name
  | [], [], _ => rfl
  | [], _ :: _, same => by simp at same
  | _ :: _, [], same => by simp at same
  | member :: rest, scopeId :: others, same => by
      simp only [List.map_cons, List.cons.injEq] at same
      have later := resolveOwner?_of_frames_eq instanceId name rest others same.2
      simp only [resolveOwner?, definitionResolveOwner?, same.1, later]
      generalize framesOf frames instanceId scopeId = selected
      rcases selected with _ | ⟨_, _ | ⟨_, _⟩⟩ <;> rfl

/-- CSD-CHAIN-01 bridge: under the three premises, the occurrence chain of `reader` names the same
frames as the definition chain of its definition in its instance, so both accounts resolve every name
to the same owner. -/
private theorem occurrenceChain_bridge (reader : ScopeOccurrenceId) (chain : List ScopeOccurrenceId)
    (chained : occurrenceChain occurrences reader = some chain)
    (premises : ChainBridgePremises definitions occurrences frames chain) :
    chain.map (framesAt frames) =
        (definitionChain definitions reader.definitionScopeId).map
          (framesOf frames reader.processInstanceId) ∧
      ∀ name, resolveOwner? frames chain name =
        definitionResolveOwner? frames reader.processInstanceId
          (definitionChain definitions reader.definitionScopeId) name := by
  obtain ⟨instances, definitionsOf⟩ := within_definitions definitions occurrences frames _ reader chain chain
    chained (List.suffix_refl _) premises
  have distinct : (chain.map (·.definitionScopeId)).Nodup := by
    apply List.pairwise_map.2
    refine (within_nodup occurrences _ reader chain chained).imp_of_mem
      fun {left right} leftInside rightInside different sameDefinition => different ?_
    obtain ⟨leftOccurrence, leftLive, leftId⟩ := within_live occurrences _ reader chain chained left leftInside
    obtain ⟨rightOccurrence, rightLive, rightId⟩ := within_live occurrences _ reader chain chained right rightInside
    obtain ⟨single, singleton⟩ := List.length_eq_one_iff.mp (premises.singular left leftInside)
    have leftSelected : leftOccurrence ∈ occurrences.filter (fun candidate =>
        candidate.id.processInstanceId == left.processInstanceId &&
          candidate.id.definitionScopeId == left.definitionScopeId) := by
      simp [leftLive, leftId]
    have rightSelected : rightOccurrence ∈ occurrences.filter (fun candidate =>
        candidate.id.processInstanceId == left.processInstanceId &&
          candidate.id.definitionScopeId == left.definitionScopeId) := by
      simp [rightLive, rightId, sameDefinition, instances left leftInside, instances right rightInside]
    rw [singleton, List.mem_singleton] at leftSelected rightSelected
    rw [← leftId, ← rightId, leftSelected, rightSelected]
  have inDefinitions : chain.map (·.definitionScopeId) ⊆ definitions.map (·.id) := by
    intro scopeId inside
    obtain ⟨member, memberInside, rfl⟩ := List.mem_map.mp inside
    obtain ⟨occurrence, live, rfl⟩ := within_live occurrences _ reader chain chained member memberInside
    exact (premises.nested occurrence live memberInside).2.2
  have enough : chain.length ≤ definitions.length := by
    simpa using distinct.length_le_of_subset inDefinitions
  have frameMaps : chain.map (framesAt frames) =
      (definitionChain definitions reader.definitionScopeId).map (framesOf frames reader.processInstanceId) := by
    rw [definitionChain, definitionsOf definitions.length enough, List.map_map]
    apply List.map_congr_left
    intro member inside
    exact framesAt_eq_framesOf definitions occurrences frames chain reader.processInstanceId premises member inside
      (within_live occurrences _ reader chain chained member inside) (instances member inside)
  exact ⟨frameMaps, fun name => resolveOwner?_of_frames_eq frames reader.processInstanceId name _ _ frameMaps⟩

end Bridge

end BpmnSemantics.SemanticProcess.NestedScopeData
