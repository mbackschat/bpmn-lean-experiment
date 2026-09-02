import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerRuntime

/-! # Compensation handler maximal-frontier activation -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure CompensationFrontierActivation where
  trigger : CompensationTriggerExecution
  waits : List CompensationHandlerEffectWait
  effectActivations : List EffectActivation
  deriving Repr, DecidableEq

private def waitBefore
    (left right : CompensationHandlerEffectWait) : Bool :=
  compensationOccurrenceBefore left.id right.id

def insertCompensationHandlerEffectWait (wait : CompensationHandlerEffectWait)
    (waits : List CompensationHandlerEffectWait) : List CompensationHandlerEffectWait :=
  canonicalInsertBy waitBefore wait waits

private def handlerHasUnfinishedSuccessor (trigger : CompensationTriggerExecution)
    (handler : CompensationHandlerExecution) : Bool :=
  trigger.dependencies.any fun dependency =>
    compensationSubjectMatches dependency.predecessor handler.identity.subject &&
      trigger.handlers.any fun candidate =>
        compensationSubjectMatches candidate.identity.subject dependency.successor &&
          match candidate.lifecycle with
          | .pending _ | .compensating _ _ => true
          | _ => false

/-- A frontier contains every pending subject with no unfinished forward successor. -/
def compensationHandlerIsMaximal (trigger : CompensationTriggerExecution)
    (handler : CompensationHandlerExecution) : Bool :=
  (match handler.lifecycle with | .pending _ => true | _ => false) &&
    !handlerHasUnfinishedSuccessor trigger handler

/-- Reads the activation counter used to construct the next compensation effect identity. -/
def compensationEffectActivationCountIn (activations : List EffectActivation)
    (elementId : NodeId) : Nat :=
  match activations.find? fun activation => activation.elementId == elementId with
  | some activation => activation.count
  | none => 0

/-- Derives an effect's arguments from the handler input contract and its retained context. -/
def compensationHandlerArguments? (body : SingleEffectCompensationHandlerBody)
    (restoredContext : Option CompensationParentContextSnapshot) :
    Option (List VariableBinding) :=
  match body.input, restoredContext with
  | .empty, none => some []
  | .restoredProcessBinding sourceName argumentName, some snapshot =>
      match snapshot.frames with
      | processFrame :: _ =>
          match processFrame.bindings.filter fun binding => binding.name == sourceName with
          | [source] => some [{ name := argumentName, value := source.value }]
          | _ => none
      | _ => none
  | _, _ => none

/-- Declarative activation of one maximal handler against the immutable pre-frontier trigger. -/
inductive CompensationHandlerActivationStep (program : Program)
    (trigger : CompensationTriggerExecution) :
    CompensationHandlerExecution → List EffectActivation →
      CompensationHandlerExecution → CompensationHandlerEffectWait →
      List EffectActivation → Prop where
  | activate (handler : CompensationHandlerExecution)
      (activations : List EffectActivation)
      (definition : CompensationSubjectDefinition)
      (restoredContext : Option CompensationParentContextSnapshot)
      (arguments : List VariableBinding) (activation : Nat)
      (maximal : compensationHandlerIsMaximal trigger handler = true)
      (declared : compensationSubjectDefinitionForOccurrence?
        program handler.identity.subject = some definition)
      (pending : handler.lifecycle = .pending restoredContext)
      (mapped : compensationHandlerArguments? definition.body restoredContext =
        some arguments)
      (fresh : activation = compensationEffectActivationCountIn activations
        definition.body.effectElementId + 1) :
      CompensationHandlerActivationStep program trigger handler activations
        { identity := handler.identity
          lifecycle := .compensating restoredContext
            { processInstanceId := trigger.id.processInstanceId
              elementId := ⟨definition.body.effectElementId.value⟩
              activation } }
        { id :=
            { processInstanceId := trigger.id.processInstanceId
              elementId := ⟨definition.body.effectElementId.value⟩
              activation }
          triggerId := trigger.id
          handlerId := handler.identity.id
          descriptor := definition.body.descriptor
          arguments }
        (setEffectActivationCount activations definition.body.effectElementId activation)

/-- Declarative reasons why one maximal handler cannot enter its compensation effect. -/
inductive CompensationHandlerActivationRefusal (program : Program)
    (trigger : CompensationTriggerExecution) (handler : CompensationHandlerExecution)
    (activations : List EffectActivation) : Prop where
  | missingDefinition
      (maximal : compensationHandlerIsMaximal trigger handler = true)
      (absent : compensationSubjectDefinitionForOccurrence?
        program handler.identity.subject = none) :
      CompensationHandlerActivationRefusal program trigger handler activations
  | nonpending (definition : CompensationSubjectDefinition)
      (maximal : compensationHandlerIsMaximal trigger handler = true)
      (declared : compensationSubjectDefinitionForOccurrence?
        program handler.identity.subject = some definition)
      (nonpending : match handler.lifecycle with | .pending _ => false | _ => true) :
      CompensationHandlerActivationRefusal program trigger handler activations
  | invalidArguments (definition : CompensationSubjectDefinition)
      (restoredContext : Option CompensationParentContextSnapshot)
      (maximal : compensationHandlerIsMaximal trigger handler = true)
      (declared : compensationSubjectDefinitionForOccurrence?
        program handler.identity.subject = some definition)
      (pending : handler.lifecycle = .pending restoredContext)
      (unmapped : compensationHandlerArguments? definition.body restoredContext = none) :
      CompensationHandlerActivationRefusal program trigger handler activations

/-- Declarative maximal-frontier traversal; nonmaximal handlers are preserved exactly. -/
inductive CompensationFrontierHandlersStep (program : Program)
    (trigger : CompensationTriggerExecution) :
    List CompensationHandlerExecution → List EffectActivation →
      List CompensationHandlerExecution → List CompensationHandlerEffectWait →
      List EffectActivation → Prop where
  | nil (activations : List EffectActivation) :
      CompensationFrontierHandlersStep program trigger [] activations [] [] activations
  | activate (handler updated : CompensationHandlerExecution)
      (rest handlers : List CompensationHandlerExecution)
      (activations nextActivations finalActivations : List EffectActivation)
      (wait : CompensationHandlerEffectWait)
      (waits : List CompensationHandlerEffectWait)
      (head : CompensationHandlerActivationStep program trigger handler activations
        updated wait nextActivations)
      (tail : CompensationFrontierHandlersStep program trigger rest nextActivations
        handlers waits finalActivations) :
      CompensationFrontierHandlersStep program trigger (handler :: rest) activations
        (updated :: handlers) (insertCompensationHandlerEffectWait wait waits)
        finalActivations
  | preserve (handler : CompensationHandlerExecution)
      (rest handlers : List CompensationHandlerExecution)
      (activations finalActivations : List EffectActivation)
      (waits : List CompensationHandlerEffectWait)
      (notMaximal : compensationHandlerIsMaximal trigger handler = false)
      (tail : CompensationFrontierHandlersStep program trigger rest activations
        handlers waits finalActivations) :
      CompensationFrontierHandlersStep program trigger (handler :: rest) activations
        (handler :: handlers) waits finalActivations

/-- Declarative failure of a maximal-frontier traversal. -/
inductive CompensationFrontierHandlersRefusal (program : Program)
    (trigger : CompensationTriggerExecution) :
    List CompensationHandlerExecution → List EffectActivation → Prop where
  | head (handler : CompensationHandlerExecution)
      (rest : List CompensationHandlerExecution)
      (activations : List EffectActivation)
      (refusal : CompensationHandlerActivationRefusal
        program trigger handler activations) :
      CompensationFrontierHandlersRefusal program trigger
        (handler :: rest) activations
  | activatedTail (handler updated : CompensationHandlerExecution)
      (rest : List CompensationHandlerExecution)
      (activations nextActivations : List EffectActivation)
      (wait : CompensationHandlerEffectWait)
      (head : CompensationHandlerActivationStep program trigger handler activations
        updated wait nextActivations)
      (tail : CompensationFrontierHandlersRefusal
        program trigger rest nextActivations) :
      CompensationFrontierHandlersRefusal program trigger
        (handler :: rest) activations
  | preservedTail (handler : CompensationHandlerExecution)
      (rest : List CompensationHandlerExecution)
      (activations : List EffectActivation)
      (notMaximal : compensationHandlerIsMaximal trigger handler = false)
      (tail : CompensationFrontierHandlersRefusal
        program trigger rest activations) :
      CompensationFrontierHandlersRefusal program trigger
        (handler :: rest) activations

private def activateHandlers (program : Program) (trigger : CompensationTriggerExecution) :
    List CompensationHandlerExecution → List EffectActivation →
      Option (List CompensationHandlerExecution ×
        List CompensationHandlerEffectWait × List EffectActivation)
  | [], activations => some ([], [], activations)
  | handler :: rest, activations => do
      if compensationHandlerIsMaximal trigger handler then
        let definition ← compensationSubjectDefinitionForOccurrence?
          program handler.identity.subject
        let restoredContext ← match handler.lifecycle with
          | .pending context => some context
          | _ => none
        let arguments ← compensationHandlerArguments? definition.body restoredContext
        let activation := compensationEffectActivationCountIn activations
          definition.body.effectElementId + 1
        let effectId : EffectOccurrenceId :=
          { processInstanceId := trigger.id.processInstanceId
            elementId := ⟨definition.body.effectElementId.value⟩
            activation }
        let nextActivations := setEffectActivationCount activations
          definition.body.effectElementId activation
        let (handlers, waits, finalActivations) ←
          activateHandlers program trigger rest nextActivations
        let updated : CompensationHandlerExecution :=
          { identity := handler.identity
            lifecycle := .compensating restoredContext effectId }
        let wait : CompensationHandlerEffectWait :=
          { id := effectId
            triggerId := trigger.id
            handlerId := handler.identity.id
            descriptor := definition.body.descriptor
            arguments }
        pure (updated :: handlers,
          insertCompensationHandlerEffectWait wait waits, finalActivations)
      else do
        let (handlers, waits, finalActivations) ←
          activateHandlers program trigger rest activations
        pure (handler :: handlers, waits, finalActivations)

private theorem activateHandlers_sound (program : Program)
    (trigger : CompensationTriggerExecution)
    (beforeHandlers afterHandlers : List CompensationHandlerExecution)
    (beforeActivations afterActivations : List EffectActivation)
    (waits : List CompensationHandlerEffectWait)
    (selected : activateHandlers program trigger beforeHandlers beforeActivations =
      some (afterHandlers, waits, afterActivations)) :
    CompensationFrontierHandlersStep program trigger beforeHandlers beforeActivations
      afterHandlers waits afterActivations := by
  induction beforeHandlers generalizing beforeActivations afterHandlers waits afterActivations with
  | nil =>
      simp [activateHandlers] at selected
      rcases selected with ⟨rfl, rfl, rfl⟩
      exact .nil beforeActivations
  | cons handler rest ih =>
      cases maximalEq : compensationHandlerIsMaximal trigger handler with
      | false =>
          cases tailEq : activateHandlers program trigger rest beforeActivations with
          | none => simp [activateHandlers, maximalEq, tailEq] at selected
          | some tailResult =>
              rcases tailResult with ⟨handlers, tailWaits, finalActivations⟩
              simp [activateHandlers, maximalEq, tailEq] at selected
              rcases selected with ⟨rfl, rfl, rfl⟩
              exact .preserve handler rest handlers beforeActivations finalActivations
                tailWaits maximalEq
                (ih handlers beforeActivations finalActivations tailWaits tailEq)
      | true =>
          cases declaredEq : compensationSubjectDefinitionForOccurrence?
              program handler.identity.subject with
          | none => simp [activateHandlers, maximalEq, declaredEq] at selected
          | some definition =>
              cases lifecycleEq : handler.lifecycle with
              | pending restoredContext =>
                  cases mappedEq : compensationHandlerArguments?
                      definition.body restoredContext with
                  | none =>
                      simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                        mappedEq] at selected
                  | some arguments =>
                      let activation := compensationEffectActivationCountIn beforeActivations
                        definition.body.effectElementId + 1
                      let nextActivations := setEffectActivationCount beforeActivations
                        definition.body.effectElementId activation
                      cases tailEq : activateHandlers program trigger rest nextActivations with
                      | none =>
                          simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                            mappedEq, activation, nextActivations, tailEq] at selected
                      | some tailResult =>
                          rcases tailResult with ⟨handlers, tailWaits, finalActivations⟩
                          simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                            mappedEq, activation, nextActivations, tailEq] at selected
                          rcases selected with ⟨rfl, rfl, rfl⟩
                          exact .activate handler
                            { identity := handler.identity
                              lifecycle := .compensating restoredContext
                                { processInstanceId := trigger.id.processInstanceId
                                  elementId := ⟨definition.body.effectElementId.value⟩
                                  activation } }
                            rest handlers beforeActivations nextActivations finalActivations
                            { id :=
                                { processInstanceId := trigger.id.processInstanceId
                                  elementId := ⟨definition.body.effectElementId.value⟩
                                  activation }
                              triggerId := trigger.id
                              handlerId := handler.identity.id
                              descriptor := definition.body.descriptor
                              arguments }
                            tailWaits
                            (.activate handler beforeActivations definition restoredContext
                              arguments activation maximalEq declaredEq lifecycleEq mappedEq rfl)
                            (ih handlers nextActivations finalActivations tailWaits tailEq)
              | compensating restoredContext effectId =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected
              | compensated =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected
              | failed =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected
              | terminated =>
                  simp [activateHandlers, maximalEq, declaredEq, lifecycleEq] at selected

private theorem activateHandlers_refusal_sound (program : Program)
    (trigger : CompensationTriggerExecution)
    (handlers : List CompensationHandlerExecution)
    (activations : List EffectActivation)
    (refused : activateHandlers program trigger handlers activations = none) :
    CompensationFrontierHandlersRefusal program trigger handlers activations := by
  induction handlers generalizing activations with
  | nil => simp [activateHandlers] at refused
  | cons handler rest ih =>
      cases maximalEq : compensationHandlerIsMaximal trigger handler with
      | false =>
          cases tailEq : activateHandlers program trigger rest activations with
          | none =>
              exact .preservedTail handler rest activations maximalEq
                (ih activations tailEq)
          | some result => simp [activateHandlers, maximalEq, tailEq] at refused
      | true =>
          cases declaredEq : compensationSubjectDefinitionForOccurrence?
              program handler.identity.subject with
          | none => exact .head handler rest activations (.missingDefinition maximalEq declaredEq)
          | some definition =>
              cases lifecycleEq : handler.lifecycle with
              | pending restoredContext =>
                  cases mappedEq : compensationHandlerArguments?
                      definition.body restoredContext with
                  | none =>
                      exact .head handler rest activations
                        (.invalidArguments definition restoredContext maximalEq declaredEq
                          lifecycleEq mappedEq)
                  | some arguments =>
                      let activation := compensationEffectActivationCountIn activations
                        definition.body.effectElementId + 1
                      let nextActivations := setEffectActivationCount activations
                        definition.body.effectElementId activation
                      cases tailEq : activateHandlers program trigger rest nextActivations with
                      | none =>
                          exact .activatedTail handler
                            { identity := handler.identity
                              lifecycle := .compensating restoredContext
                                { processInstanceId := trigger.id.processInstanceId
                                  elementId := ⟨definition.body.effectElementId.value⟩
                                  activation } }
                            rest activations nextActivations
                            { id :=
                                { processInstanceId := trigger.id.processInstanceId
                                  elementId := ⟨definition.body.effectElementId.value⟩
                                  activation }
                              triggerId := trigger.id
                              handlerId := handler.identity.id
                              descriptor := definition.body.descriptor
                              arguments }
                            (.activate handler activations definition restoredContext
                              arguments activation maximalEq declaredEq lifecycleEq mappedEq rfl)
                            (ih nextActivations tailEq)
                      | some result =>
                          simp [activateHandlers, maximalEq, declaredEq, lifecycleEq,
                            mappedEq, activation, nextActivations, tailEq] at refused
              | compensating restoredContext effectId =>
                  exact .head handler rest activations
                    (.nonpending definition maximalEq declaredEq (by simp [lifecycleEq]))
              | compensated =>
                  exact .head handler rest activations
                    (.nonpending definition maximalEq declaredEq (by simp [lifecycleEq]))
              | failed =>
                  exact .head handler rest activations
                    (.nonpending definition maximalEq declaredEq (by simp [lifecycleEq]))
              | terminated =>
                  exact .head handler rest activations
                    (.nonpending definition maximalEq declaredEq (by simp [lifecycleEq]))

/-- Activates the complete maximal frontier against one immutable pre-frontier trigger. -/
def activateCompensationFrontier (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : Option CompensationFrontierActivation := do
  if trigger.lifecycle != .active then none
  else
    let (handlers, waits, effectActivations) ←
      activateHandlers program trigger trigger.handlers state.effectActivations
    pure { trigger := { trigger with handlers }, waits, effectActivations }

inductive CompensationFrontierStep (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : CompensationFrontierActivation → Prop where
  | activate (handlers : List CompensationHandlerExecution)
      (waits : List CompensationHandlerEffectWait)
      (effectActivations : List EffectActivation)
      (active : trigger.lifecycle = .active)
      (frontier : CompensationFrontierHandlersStep program trigger trigger.handlers
        state.effectActivations handlers waits effectActivations) :
      CompensationFrontierStep program state trigger
        { trigger := { trigger with handlers }, waits, effectActivations }

/-- Declarative refusal before any frontier state is committed. -/
inductive CompensationFrontierRefusalStep (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) : Prop where
  | inactive (inactive : (trigger.lifecycle != .active) = true) :
      CompensationFrontierRefusalStep program state trigger
  | handlers
      (active : trigger.lifecycle = .active)
      (refusal : CompensationFrontierHandlersRefusal
        program trigger trigger.handlers state.effectActivations) :
      CompensationFrontierRefusalStep program state trigger

theorem activateCompensationFrontier_sound (program : Program) (state : RuntimeState)
    (trigger : CompensationTriggerExecution) (activation : CompensationFrontierActivation)
    (selected : activateCompensationFrontier program state trigger = some activation) :
    CompensationFrontierStep program state trigger activation := by
  cases activeEq : trigger.lifecycle != .active with
  | true => simp [activateCompensationFrontier, activeEq] at selected
  | false =>
      cases handlersEq : activateHandlers program trigger trigger.handlers
          state.effectActivations with
      | none => simp [activateCompensationFrontier, activeEq, handlersEq] at selected
      | some result =>
          rcases result with ⟨handlers, waits, effectActivations⟩
          simp [activateCompensationFrontier, activeEq, handlersEq] at selected
          cases selected
          exact .activate handlers waits effectActivations (by simpa using activeEq)
            (activateHandlers_sound program trigger trigger.handlers handlers
              state.effectActivations effectActivations waits handlersEq)

theorem activateCompensationFrontier_refusal_sound (program : Program)
    (state : RuntimeState) (trigger : CompensationTriggerExecution)
    (refused : activateCompensationFrontier program state trigger = none) :
    CompensationFrontierRefusalStep program state trigger := by
  cases activeEq : trigger.lifecycle != .active with
  | true => exact .inactive activeEq
  | false =>
      cases handlersEq : activateHandlers program trigger trigger.handlers
          state.effectActivations with
      | none =>
          exact .handlers (by simpa using activeEq)
            (activateHandlers_refusal_sound program trigger trigger.handlers
              state.effectActivations handlersEq)
      | some result =>
          rcases result with ⟨handlers, waits, effectActivations⟩
          simp [activateCompensationFrontier, activeEq, handlersEq] at refused

end BpmnSemantics.SemanticProcess
