import BpmnSemantics.SemanticProcess.ParallelScopeWaitCompletionProofs
import BpmnSemantics.SemanticProcess.InternalRegionalCancellationEffectValidity
import BpmnSemantics.SemanticProcess.ParallelScopePopulationPreservation
import BpmnSemantics.SemanticProcess.ParallelScopeLocalFrameProofs

/-! PMIS entry, completion and retirement preserve the full wait projection
contract, including the Service wait/local-data bijection. Declaration provenance
alone does not establish the fields and identities that lifecycle publication reads. -/

namespace BpmnSemantics.SemanticProcess.ParallelScopeCommand

open BpmnSemantics InternalCommutation

private theorem filter_erase_of_false {α : Type} [BEq α] [LawfulBEq α]
    (values : List α) (removed : α) (predicate : α → Bool)
    (absent : predicate removed = false) :
    (values.erase removed).filter predicate = values.filter predicate := by
  rw [← List.erase_filter]
  apply List.erase_of_not_mem
  intro member
  have kept := (List.mem_filter.mp member).2
  simp [absent] at kept

/-- Exact Human wait disposal preserves projection independently of the enclosing repeated-scope family. -/
theorem human_disposal_valid (program : Program) (before : RuntimeState)
    (wait : UserTaskWait) (variables : ScopedVariables)
    (activities : variables.activities = before.variables.activities)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (messages : before.messageWaits = []) (timers : before.timerWaits = []) :
    flowNodeOccurrenceWaitProgramValidity program { before with
      waits := before.waits.erase wait, variables,
      tokens := addToken before.tokens wait.output wait.owner } = true := by
  simp only [flowNodeOccurrenceWaitProgramValidity, messages, timers, List.all_nil,
    Bool.and_true, Bool.and_eq_true] at prior ⊢
  refine ⟨?_, ?_⟩
  · unfold flowNodeOccurrenceUserTaskProgramValidity at prior ⊢
    apply List.all_eq_true.mpr
    intro retained member
    with_unfolding_all exact List.all_eq_true.mp prior.1 retained (List.erase_sublist.subset member)
  · exact (flowNodeOccurrenceEffectProgramValidity_frame program before
      { before with waits := before.waits.erase wait, variables := variables, tokens := addToken before.tokens wait.output wait.owner }
      rfl rfl rfl activities).trans prior.2

private theorem matching_effect_identity (left right : EffectOccurrenceId)
    (frame : ActivityVariableScope)
    (first : activityScopeMatches left frame = true)
    (second : activityScopeMatches right frame = true) : left = right := by
  exact LocalDataOwner.effectOccurrence.inj ((of_decide_eq_true first).trans (of_decide_eq_true second).symm)

private theorem effect_disposal_valid (program : Program) (before : RuntimeState)
    (wait : EffectWait) (member : wait ∈ before.effectWaits)
    (variables : ScopedVariables) (activities : variables.activities = before.variables.activities)
    (prior : flowNodeOccurrenceEffectProgramValidity program before = true)
    (incidents : before.effectIncidents = []) :
    flowNodeOccurrenceEffectProgramValidity program { before with
      effectWaits := before.effectWaits.erase wait,
      variables := { variables with activities := variables.activities.filter (fun frame =>
        !activityScopeMatches (effectWaitOccurrenceId wait) frame) },
      tokens := addToken before.tokens wait.output wait.owner } = true := by
  have original := prior
  simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at prior ⊢
  refine ⟨⟨?_, ?_⟩, ?_⟩
  · apply List.all_eq_true.mpr
    intro retained present
    with_unfolding_all exact List.all_eq_true.mp prior.1.1 retained (List.erase_sublist.subset present)
  · simp only [incidents, List.all_nil]
  · have locals := prior.2
    change ((before.effectWaits ++ before.effectIncidents.map (·.wait)).all (fun candidate =>
      decide (((before.effectWaits ++ before.effectIncidents.map (·.wait)).filter
        (fun other => decide (effectWaitOccurrenceId other = effectWaitOccurrenceId candidate))).length = 1) &&
      (match before.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId candidate)) with
       | [frame] => decide (frame.bindings = candidate.arguments)
       | _ => false)) && _) = true at locals
    simp only [incidents, List.map_nil, List.append_nil, Bool.and_eq_true] at locals
    have target := List.all_eq_true.mp locals.1 wait member
    simp only [Bool.and_eq_true] at target
    obtain ⟨only, census⟩ := List.length_eq_one_iff.mp (of_decide_eq_true target.1)
    have present : wait ∈ before.effectWaits.filter
        (fun other => decide (effectWaitOccurrenceId other = effectWaitOccurrenceId wait)) := by
      exact List.mem_filter.mpr ⟨member, by simp⟩
    rw [census] at present
    have same : only = wait := (List.mem_singleton.mp present).symm
    subst only
    have absent : wait ∉ before.effectWaits.erase wait := by
      intro retained
      have selected : wait ∈ (before.effectWaits.erase wait).filter
          (fun other => decide (effectWaitOccurrenceId other = effectWaitOccurrenceId wait)) :=
        List.mem_filter.mpr ⟨retained, by simp⟩
      rw [← List.erase_filter, census] at selected
      simp at selected
    change (((before.effectWaits.erase wait) ++ before.effectIncidents.map (·.wait)).all _ && _) = true
    simp only [incidents, List.map_nil, List.append_nil, activities, Bool.and_eq_true]
    refine ⟨List.all_eq_true.mpr ?_, List.all_eq_true.mpr ?_⟩
    · intro retained kept
      have retainedMember := List.erase_sublist.subset kept
      have different : effectWaitOccurrenceId wait ≠ effectWaitOccurrenceId retained := by
        intro equal
        have same := effect_program_validity_identity_injective program before original retained wait
          (by simp [incidents, retainedMember]) (by simp [incidents, member]) equal
        exact absent (same ▸ kept)
      have counts := filter_erase_of_false before.effectWaits wait
        (fun other => decide (effectWaitOccurrenceId other = effectWaitOccurrenceId retained))
        (by simp [different])
      have frameFilter : (before.variables.activities.filter
          (fun frame => !activityScopeMatches (effectWaitOccurrenceId wait) frame)).filter
            (activityScopeMatches (effectWaitOccurrenceId retained)) =
          before.variables.activities.filter (activityScopeMatches (effectWaitOccurrenceId retained)) := by
        rw [List.filter_filter]
        apply List.filter_congr
        intro frame _
        cases matched : activityScopeMatches (effectWaitOccurrenceId retained) frame with
        | false => simp
        | true =>
          have other : activityScopeMatches (effectWaitOccurrenceId wait) frame = false := by
            cases checked : activityScopeMatches (effectWaitOccurrenceId wait) frame with
            | false => rfl
            | true => exact False.elim (different (matching_effect_identity _ _ frame checked matched))
          simp [other]
      change (decide (((before.effectWaits.erase wait).filter (fun other =>
          decide (effectWaitOccurrenceId other = effectWaitOccurrenceId retained))).length = 1) &&
        match (before.variables.activities.filter (fun frame =>
            !activityScopeMatches (effectWaitOccurrenceId wait) frame)).filter
              (activityScopeMatches (effectWaitOccurrenceId retained)) with
        | [frame] => decide (frame.bindings = retained.arguments)
        | _ => false) = true
      rw [counts, frameFilter]
      exact List.all_eq_true.mp locals.1 retained retainedMember
    · intro frame kept
      obtain ⟨old, outside⟩ := List.mem_filter.mp kept
      have oldValid := List.all_eq_true.mp locals.2 frame old
      cases owner : frame.owner with
      | activityOccurrence id => trivial
      | effectOccurrence id =>
        have notMatched : activityScopeMatches (effectWaitOccurrenceId wait) frame = false := by
          simpa only [Bool.not_eq_true'] using outside
        have counts := filter_erase_of_false before.effectWaits wait
          (fun candidate => activityScopeMatches (effectWaitOccurrenceId candidate) frame) notMatched
        simpa only [owner, counts] using oldValid

theorem completeTask_wait_program_validity (program : Program)
    (before after : RuntimeState) (id : UserTaskInstanceId) (values : List VariableBinding)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (messages : before.messageWaits = []) (timers : before.timerWaits = [])
    (completed : completeTask? program before id values = some after) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  unfold completeTask? at completed
  split at completed <;> try contradiction
  split at completed
  · unfold completeParallelScopeUserTask? at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    exact human_disposal_valid program before _ variables
      (writeParallelScopeValues_preserves_activities written) prior messages timers
  · obtain ⟨successor, applied, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeUserTask at applied
    split at applied <;> try contradiction
    cases Option.some.inj applied
    cases Option.some.inj completed
    exact human_disposal_valid program before _ _ rfl prior messages timers

/-- Exact Service wait and local-frame disposal preserves projection independently of the enclosing repeated-scope family. -/
theorem service_disposal_valid (program : Program) (before : RuntimeState)
    (wait : EffectWait) (member : wait ∈ before.effectWaits)
    (variables : ScopedVariables) (activities : variables.activities = before.variables.activities)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (messages : before.messageWaits = []) (timers : before.timerWaits = [])
    (incidents : before.effectIncidents = []) :
    flowNodeOccurrenceWaitProgramValidity program { before with
      effectWaits := before.effectWaits.erase wait,
      variables := { variables with activities := variables.activities.filter (fun frame =>
        !activityScopeMatches (effectWaitOccurrenceId wait) frame) },
      tokens := addToken before.tokens wait.output wait.owner } = true := by
  simp only [flowNodeOccurrenceWaitProgramValidity, messages, timers, List.all_nil,
    Bool.and_true, Bool.and_eq_true] at prior ⊢
  refine ⟨?_, effect_disposal_valid program before wait member variables activities prior.2 incidents⟩
  with_unfolding_all exact prior.1

theorem completeEffect_success_wait_program_validity (program : Program)
    (before after : RuntimeState) (id : EffectOccurrenceId) (values : List VariableBinding)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (messages : before.messageWaits = []) (timers : before.timerWaits = [])
    (incidents : before.effectIncidents = [])
    (completed : completeEffect? program before id (.success values) = some after) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  unfold completeEffect? at completed
  split at completed <;> try contradiction
  rename_i candidates wait selected
  have chosen : wait ∈ before.effectWaits.filter (effectIdNamesWait id) := by rw [selected]; simp
  have member := (List.mem_filter.mp chosen).1
  have identity : id = effectWaitOccurrenceId wait := by
    have matched := (List.mem_filter.mp chosen).2
    simp only [effectIdNamesWait, Bool.and_eq_true, beq_iff_eq] at matched
    cases id with
    | mk process element activation =>
      cases element
      simp_all [effectWaitOccurrenceId]
  split at completed
  · simp only [completeParallelScopeEffect?, selected] at completed
    split at completed <;> try contradiction
    split at completed <;> try contradiction
    obtain ⟨projected, _, completed⟩ := Option.bind_eq_some_iff.mp completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    cases Option.some.inj completed
    rw [identity]
    exact service_disposal_valid program before wait member variables
      (writeParallelScopeValues_preserves_activities written) prior messages timers incidents
  · simp only [completeSerialEffect?, selected] at completed
    obtain ⟨variables, written, completed⟩ := Option.bind_eq_some_iff.mp completed
    unfold completeSerialActivityScope? at written
    split at written <;> try contradiction
    obtain ⟨bindings, _, written⟩ := Option.bind_eq_some_iff.mp written
    cases Option.some.inj written
    cases Option.some.inj completed
    rw [identity]
    exact service_disposal_valid program before wait member
      { before.variables with process := { bindings } } rfl prior messages timers incidents

private theorem retirement_preparation_wait_valid (program : Program) (state : RuntimeState)
    (variables : ScopedVariables) (activities : List ActivityOccurrence)
    (controllers : List ParallelScopeController)
    (locals : variables.activities = state.variables.activities)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (messages : state.messageWaits = []) (timers : state.timerWaits = []) :
    flowNodeOccurrenceWaitProgramValidity program
      { state with
        variables := variables
        activityOccurrences := activities
        parallelScopeControllers := controllers } = true := by
  simp only [flowNodeOccurrenceWaitProgramValidity, messages, timers, List.all_nil,
    Bool.and_true, Bool.and_eq_true] at prior ⊢
  refine ⟨?_, ?_⟩
  · exact (flowNodeOccurrenceUserTaskProgramValidity_frame program state _ rfl rfl).trans prior.1
  · exact (flowNodeOccurrenceEffectProgramValidity_frame program state
      { state with variables := variables, activityOccurrences := activities, parallelScopeControllers := controllers }
      rfl rfl rfl locals).trans prior.2

private theorem cancel_bodies_wait_valid (program : Program)
    (iterations : List ParallelScopeIteration) (state : RuntimeState)
    (prior : flowNodeOccurrenceWaitProgramValidity program state = true)
    (incidents : state.effectIncidents = []) :
    flowNodeOccurrenceWaitProgramValidity program
      (iterations.foldl (fun current iteration => cancelScopeSubtree current iteration.scope .remove) state) = true := by
  induction iterations generalizing state with
  | nil => exact prior
  | cons first rest ih =>
      apply ih
      · exact cancelScopeSubtree_complete_wait_program_validity program state first.scope .remove prior
          (by simp [effectIncidentAssociationsValid, incidents])
      · simp [cancelScopeSubtree, incidents]

/-- Natural and early retirement retain the full publication contract of surviving waits. -/
theorem completeParallelScope_wait_program_validity (program : Program)
    (entry : ParallelScopeEntry) (target : ScopeOccurrenceId) (before after : RuntimeState)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (messages : before.messageWaits = []) (timers : before.timerWaits = [])
    (incidents : before.effectIncidents = [])
    (completed : completeParallelScope? entry before target = some after) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  unfold completeParallelScope? at completed
  obtain ⟨binding, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  dsimp only at completed
  split at completed <;> try contradiction
  obtain ⟨variables, removed, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨condition, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  obtain ⟨retirement, _, completed⟩ := Option.bind_eq_some_iff.mp completed
  have locals := (removeScopeVariables_preserves_other_data removed).2.1
  have prepared := retirement_preparation_wait_valid program before variables
    (before.activityOccurrences.filter (· != binding.activity))
    (before.parallelScopeControllers.filter (· != binding.controller)) locals prior messages timers
  have retired := cancelScopeSubtree_complete_wait_program_validity program _ target .remove prepared
    (by simp [effectIncidentAssociationsValid, incidents])
  rcases retirement with ⟨successor, _, first, rest⟩ | ⟨_, _⟩ | ⟨_, _, first, rest⟩ <;>
    cases Option.some.inj completed
  · apply cancelScopeSubtree_complete_wait_program_validity
    · exact retirement_preparation_wait_valid program before variables _ _ locals prior messages timers
    · simp [effectIncidentAssociationsValid, incidents]
  · with_unfolding_all exact retired
  · have cancelled := cancel_bodies_wait_valid program (first :: rest) _ retired
      (by simp [cancelScopeSubtree, incidents])
    with_unfolding_all exact cancelled

end BpmnSemantics.SemanticProcess.ParallelScopeCommand

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics FlowNodeOccurrenceProgramValidity.Internal

private theorem retained_waits_owner_extension (program : Program) (before after : RuntimeState)
    (waits : after.waits = before.waits) (effects : after.effectWaits = before.effectWaits)
    (incidents : after.effectIncidents = []) (beforeIncidents : before.effectIncidents = [])
    (activities : after.variables.activities = before.variables.activities)
    (messages : after.messageWaits = []) (timers : after.timerWaits = [])
    (live : ∀ owner, flowNodeOccurrenceOwnerLiveUnique before owner = true →
      flowNodeOccurrenceOwnerLiveUnique after owner = true)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  have ownerFrame (process : SemanticId) (owner : ScopeOccurrenceId) (element : NodeId) (activation : Nat)
      (valid : occurrenceOwnerValid before process owner element activation = true) :
      occurrenceOwnerValid after process owner element activation = true := by
    simp only [occurrenceOwnerValid, Bool.and_eq_true] at valid ⊢
    exact ⟨valid.1, live owner valid.2⟩
  simp only [flowNodeOccurrenceWaitProgramValidity, Bool.and_eq_true] at prior
  simp only [flowNodeOccurrenceWaitProgramValidity, messages, timers, List.all_nil,
    Bool.and_true, Bool.and_eq_true]
  refine ⟨?_, ?_⟩
  · have human := prior.1.1.1
    unfold flowNodeOccurrenceUserTaskProgramValidity at human ⊢
    rw [waits, List.all_eq_true]
    intro wait member
    have old := List.all_eq_true.mp human wait member
    change (occurrenceOwnerValid before wait.processInstanceId wait.owner
      ⟨wait.task.id.value⟩ wait.activation && _) = true at old
    change (occurrenceOwnerValid after wait.processInstanceId wait.owner
      ⟨wait.task.id.value⟩ wait.activation && _) = true
    simp only [Bool.and_eq_true] at old ⊢
    exact ⟨ownerFrame _ _ _ _ old.1, old.2⟩
  · have effect := prior.2
    simp only [flowNodeOccurrenceEffectProgramValidity, Bool.and_eq_true] at effect ⊢
    refine ⟨⟨?_, by simp [incidents]⟩, ?_⟩
    · rw [effects, List.all_eq_true]
      intro wait member
      have old := List.all_eq_true.mp effect.1.1 wait member
      change (occurrenceOwnerValid before wait.processInstanceId wait.owner
        wait.elementId wait.activation && _) = true at old
      change (occurrenceOwnerValid after wait.processInstanceId wait.owner
        wait.elementId wait.activation && _) = true
      simp only [Bool.and_eq_true] at old ⊢
      exact ⟨ownerFrame _ _ _ _ old.1, old.2⟩
    · have localBefore := effect.2
      change ((before.effectWaits ++ before.effectIncidents.map (·.wait)).all _ &&
        before.variables.activities.all _) = true at localBefore
      change ((after.effectWaits ++ after.effectIncidents.map (·.wait)).all _ &&
        after.variables.activities.all _) = true
      simp only [effects, incidents, beforeIncidents, activities, List.map_nil, List.append_nil] at localBefore ⊢
      exact localBefore

private theorem issued_wait_fields (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (items : List String) (index : Nat) (before after : RuntimeState)
    (iterations : List ParallelScopeIteration)
    (issued : issueParallelBodies? entry parent items index before = some (after, iterations)) :
    after.waits = before.waits ∧ after.effectWaits = before.effectWaits ∧
      after.messageWaits = before.messageWaits ∧ after.timerWaits = before.timerWaits ∧
      after.effectIncidents = before.effectIncidents := by
  induction items generalizing before index iterations with
  | nil =>
      simp only [issueParallelBodies?, Option.some.injEq, Prod.mk.injEq] at issued
      cases issued.1
      exact ⟨rfl, rfl, rfl, rfl, rfl⟩
  | cons item items ih =>
      unfold issueParallelBodies? at issued
      obtain ⟨variables, _, issued⟩ := Option.bind_eq_some_iff.mp issued
      obtain ⟨⟨successor, rest⟩, generated, issued⟩ := Option.bind_eq_some_iff.mp issued
      cases Option.some.inj issued
      have preserved := ih _ _ _ generated
      exact preserved

private theorem entry_wait_fields (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    after.waits = before.waits ∧ after.effectWaits = before.effectWaits ∧
      after.messageWaits = before.messageWaits ∧ after.timerWaits = before.timerWaits ∧
      after.effectIncidents = before.effectIncidents := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact ⟨rfl, rfl, rfl, rfl, rfl⟩
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        have preserved := issued_wait_fields entry parent _ 0 _ issued (first :: rest) generated
        exact preserved

private theorem entry_retains_scope_population (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId)
    (before after : RuntimeState) (entered : enterParallelScope? entry before parent = some after) :
    ∀ scope ∈ before.scopeOccurrences, scope ∈ after.scopeOccurrences := by
  unfold enterParallelScope? at entered
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered <;> try contradiction
  split at entered
  · cases Option.some.inj entered
    exact fun _ member => member
  · obtain ⟨⟨issued, iterations⟩, generated, entered⟩ := Option.bind_eq_some_iff.mp entered
    cases iterations with
    | nil => contradiction
    | cons first rest =>
        cases Option.some.inj entered
        intro scope member
        exact (issueParallelBodies_scope_population generated).mem_iff.mpr (List.mem_append_right _ member)

/-- Population entry preserves existing waits when the live scope census has unique identities. -/
theorem enterParallelScope_wait_program_validity (program : Program)
    (entry : ParallelScopeEntry) (parent : ScopeOccurrenceId) (before after : RuntimeState)
    (unique : (before.scopeOccurrences.map (·.id)).Nodup)
    (prior : flowNodeOccurrenceWaitProgramValidity program before = true)
    (messages : before.messageWaits = []) (timers : before.timerWaits = [])
    (incidents : before.effectIncidents = [])
    (entered : enterParallelScope? entry before parent = some after) :
    flowNodeOccurrenceWaitProgramValidity program after = true := by
  obtain ⟨waits, effects, messageFrame, timerFrame, incidentFrame⟩ := entry_wait_fields entry parent before after entered
  have afterUnique := enterParallelScope_preserves_scope_uniqueness entered unique
  have retained := entry_retains_scope_population entry parent before after entered
  have live : ∀ owner, flowNodeOccurrenceOwnerLiveUnique before owner = true →
      flowNodeOccurrenceOwnerLiveUnique after owner = true := by
    intro owner live
    have count : (before.scopeOccurrences.filter fun scope => decide (scope.id = owner)).length = 1 :=
      of_decide_eq_true live
    obtain ⟨scope, singleton⟩ := List.length_eq_one_iff.mp count
    have selected : scope ∈ before.scopeOccurrences.filter (fun candidate => decide (candidate.id = owner)) := by
      rw [singleton]
      exact List.mem_cons_self
    obtain ⟨member, identity⟩ := List.mem_filter.mp selected
    have identity : scope.id = owner := of_decide_eq_true identity
    have census := filter_key_eq_singleton_of_nodup after.scopeOccurrences (·.id) scope afterUnique (retained scope member)
    rw [identity] at census
    simp [flowNodeOccurrenceOwnerLiveUnique, census]
  exact retained_waits_owner_extension program before after waits effects (incidentFrame.trans incidents) incidents
    (enterParallelScope_activity_frames entry parent before after entered)
    (messageFrame.trans messages) (timerFrame.trans timers) live prior

end BpmnSemantics.SemanticProcess
