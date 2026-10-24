module

public import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessRegistration
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
public import BpmnSemantics.SemanticProcess.CommandAdmission

/-! Declarative registration and its executable soundness bridge. Local laws establish exact listener
issuance, dormant handler state and execution frames, without claiming universal reachable-state preservation. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- A committed command on another profile cannot carry an undeclared Message-handler family. -/
theorem committed_foreign_profile_has_no_message_declarations (program : Program)
    (state : RuntimeState) (stimulus : Stimulus)
    (foreign : program.identity.semanticProfile ≠ interruptingMessageEventSubProcessProfileId)
    (committed : (admitStimulus program state stimulus).outcome = .committed) :
    program.interruptingMessageEventSubProcesses = [] := by
  cases declared : program.interruptingMessageEventSubProcesses with
  | nil => rfl
  | cons declaration rest =>
      cases snapshots : program.compensationEventSubProcessSnapshots <;>
        simp [admitStimulus, snapshots, interruptingMessageEventSubProcessStateValid, foreign, declared] at committed

/-- IMES-ARM-01 limits declaration-bearing Programs to the selected Message profile. -/
theorem well_formed_foreign_profile_has_no_message_declarations (program : Program)
    (valid : programWellFormed program = true)
    (foreign : program.identity.semanticProfile ≠ interruptingMessageEventSubProcessProfileId) :
    program.interruptingMessageEventSubProcesses = [] := by
  obtain ⟨_, _, lifecycle, _⟩ :=
    programGraphWellFormed_scopeContract program (programWellFormed_graph program valid)
  simp only [compensationEventSubProcessSnapshotScopeLifecycleWellFormed, Bool.and_eq_true] at lifecycle
  simpa [foreign] using lifecycle.1.2

/-- IMES-ARM-01's admitted declaration binds distinct parent and handler definitions. -/
theorem message_declarations_require_two_scopes (program : Program)
    (valid : programWellFormed program = true)
    (present : program.interruptingMessageEventSubProcesses ≠ []) :
    program.definitionScopes.length = 2 := by
  obtain ⟨_, _, lifecycle, _⟩ :=
    programGraphWellFormed_scopeContract program (programWellFormed_graph program valid)
  simp only [compensationEventSubProcessSnapshotScopeLifecycleWellFormed, Bool.and_eq_true] at lifecycle
  have selected := lifecycle.1.2
  simp only [Bool.or_eq_true, List.isEmpty_iff, Bool.and_eq_true] at selected
  rcases selected with absent | ⟨_, graph⟩
  · contradiction
  · unfold interruptingMessageEventSubProcessProgramGraph at graph
    split at graph
    · split at graph
      · simp only [Bool.and_eq_true] at graph
        have scopes := graph.1.1.1.1.1.1.1.1.2
        change (match (_ : List DefinitionScope), (_ : List DefinitionScope) with
          | [parent], [child] => _ | _, _ => false) = true at scopes
        split at scopes
        · simp only [Bool.and_eq_true, beq_iff_eq] at scopes
          omega
        · contradiction
      · contradiction
    · contradiction

/-- IMES-ARM-01 permits exactly a live-parent registration with unique counter selection and no ordinary-wait alias. -/
inductive EventSubProcessRegistrationStep : Program → RuntimeState → ScopeOccurrenceId → RuntimeState → Prop where
  | absent (program : Program) (before : RuntimeState) (parent : ScopeOccurrenceId)
      (undeclared : program.interruptingMessageEventSubProcesses = []) :
      EventSubProcessRegistrationStep program before parent before
  | arm (program : Program) (before : RuntimeState) (parent : ScopeOccurrenceId)
      (declaration : InterruptingMessageEventSubProcessDeclaration) (previous : Nat)
      (declared : program.interruptingMessageEventSubProcesses = [declaration])
      (profile : program.identity.semanticProfile = interruptingMessageEventSubProcessProfileId)
      (owned : declaration.parentScopeId = parent.definitionScopeId)
      (running : before.control = .running parent.processInstanceId)
      (empty : before.eventSubProcessMessageSubscriptions = [])
      (uniqueParent : (before.scopeOccurrences.filter (fun occurrence => occurrence.id == parent)).length = 1)
      (dormant : before.scopeOccurrences.any (fun occurrence =>
        occurrence.id.definitionScopeId == declaration.handlerScopeId) = false)
      (counter : eventSubProcessMessageCount? before declaration.startEventId = some previous)
      (capacity : previous + 1 ≤ SemanticProcessJson.maxSafeWireNat)
      (disjoint : before.messageWaits.any ((messageIdNamesWait { processInstanceId := parent.processInstanceId, elementId := ⟨declaration.startEventId.value⟩, activation := previous + 1 })) = false) :
      EventSubProcessRegistrationStep program before parent
        { before with
          eventSubProcessMessageSubscriptions := [{
            id := {
              processInstanceId := parent.processInstanceId
              elementId := ⟨declaration.startEventId.value⟩
              activation := previous + 1 }
            owner := parent, channel := declaration.channel }]
          messageActivations := setMessageActivationCount before.messageActivations
            declaration.startEventId (previous + 1) }

theorem registerEventSubProcessListener_sound (program : Program)
    (before after : RuntimeState) (parent : ScopeOccurrenceId)
    (result : registerEventSubProcessListener? program before parent = some after) :
    EventSubProcessRegistrationStep program before parent after := by
  unfold registerEventSubProcessListener? at result
  split at result
  · rename_i declared
    simp only [Option.some.injEq] at result
    subst after
    exact .absent program before parent declared
  · rename_i declaration declared
    split at result
    · simp at result
    · rename_i profile
      split at result
      · simp at result
      · rename_i owned
        split at result
        · simp at result
        · rename_i running
          split at result
          · simp at result
          · rename_i empty
            split at result
            · simp at result
            · rename_i uniqueParent
              split at result
              · simp at result
              · rename_i dormant
                cases counter : eventSubProcessMessageCount? before declaration.startEventId with
                | none => simp [counter] at result
                | some previous =>
                  simp only [counter, Option.bind_eq_bind, Option.bind_some] at result
                  split at result
                  · simp at result
                  · rename_i capacity
                    split at result
                    · simp at result
                    · rename_i disjoint
                      simp only [Option.some.injEq] at result
                      subst after
                      exact .arm program before parent declaration previous declared
                        (by simpa using profile) (by simpa using owned)
                        (by simpa using running) (by simpa using empty)
                        (by simpa using uniqueParent) (by simpa using dormant)
                        counter (by omega) (by simpa using disjoint)
  · simp at result

/-- Registration cannot create a handler, a token, a Task, data or an End occurrence. -/
theorem registration_preserves_execution (program : Program) (before after : RuntimeState)
    (parent : ScopeOccurrenceId)
    (step : EventSubProcessRegistrationStep program before parent after) :
    after.scopeOccurrences = before.scopeOccurrences ∧
    after.tokens = before.tokens ∧ after.waits = before.waits ∧
    after.variables = before.variables ∧ after.control = before.control ∧
    after.scopeActivations = before.scopeActivations ∧
    after.endOccurrences = before.endOccurrences ∧ after.logicalTimeMs = before.logicalTimeMs := by
  cases step <;> exact ⟨rfl, rfl, rfl, rfl, rfl, rfl, rfl, rfl⟩

/-- A declared successful registration exposes exactly the listener selected by its declaration and live parent. -/
theorem registration_exact_listener (program : Program) (before after : RuntimeState)
    (parent : ScopeOccurrenceId) (declaration : InterruptingMessageEventSubProcessDeclaration)
    (declared : program.interruptingMessageEventSubProcesses = [declaration])
    (step : EventSubProcessRegistrationStep program before parent after) :
    ∃ previous,
      after.eventSubProcessMessageSubscriptions = [{
        id := eventSubProcessListenerId declaration parent previous
        owner := parent, channel := declaration.channel }] ∧
      eventSubProcessMessageCount? before declaration.startEventId = some previous ∧
      previous + 1 ≤ SemanticProcessJson.maxSafeWireNat := by
  cases step with
  | absent undeclared => simp [undeclared] at declared
  | arm selected previous selectedDeclaration _ _ _ _ _ _ counter capacity _ =>
    have same : selected = declaration := by simpa [selectedDeclaration] using declared
    subst selected
    exact ⟨previous, rfl, counter, capacity⟩

/-- Dormancy is a consequence of admitted registration, not a property inferred from an empty public history. -/
theorem registration_has_no_handler (program : Program) (before after : RuntimeState)
    (parent : ScopeOccurrenceId) (declaration : InterruptingMessageEventSubProcessDeclaration)
    (declared : program.interruptingMessageEventSubProcesses = [declaration])
    (step : EventSubProcessRegistrationStep program before parent after) :
    after.scopeOccurrences.any (fun occurrence =>
      occurrence.id.definitionScopeId == declaration.handlerScopeId) = false := by
  cases step with
  | absent undeclared => simp [undeclared] at declared
  | arm selected previous selectedDeclaration _ _ _ _ _ dormant _ _ _ =>
    have same : selected = declaration := by simpa [selectedDeclaration] using declared
    subst selected
    exact dormant

/-- A second listener registration cannot overwrite an existing subscription or issue another identity. -/
theorem registration_refuses_existing_listener (program : Program) (before : RuntimeState)
    (parent : ScopeOccurrenceId) (declaration : InterruptingMessageEventSubProcessDeclaration)
    (listener : EventSubProcessMessageSubscription) (rest : List EventSubProcessMessageSubscription)
    (declared : program.interruptingMessageEventSubProcesses = [declaration])
    (occupied : before.eventSubProcessMessageSubscriptions = listener :: rest) :
    registerEventSubProcessListener? program before parent = none := by
  simp [registerEventSubProcessListener?, declared, occupied]

end BpmnSemantics.SemanticProcess
