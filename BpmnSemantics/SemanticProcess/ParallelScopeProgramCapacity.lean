module

public import BpmnSemantics.SemanticProcess.ParallelScopeStartAdmission
public import BpmnSemantics.SemanticProcess.ParallelScopeRuntime
public import BpmnSemantics.SemanticProcess.OccurrenceReservationState
public import BpmnSemantics.SemanticProcess.SequentialScopeProgramAdmission

/-! PMIS-ADMIT-01 binds private command capacity to the original decoded Program and its retained collection. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.ParallelScopeStart

def programSelected (program : Program) : Bool :=
  program.identity.semanticProfile.value == "cibseven-2.2.0-parallel-multi-instance-subprocess-draft"

@[simp] theorem programSelected_of_other_profile (program : Program)
    (different : program.identity.semanticProfile.value ≠
      "cibseven-2.2.0-parallel-multi-instance-subprocess-draft") :
    programSelected program = false := by
  simp [programSelected, different]

/-- The effect-data command guard is the identity outside its own profile, so callers of the dispatcher
discharge it from the profile they already select. -/
theorem programSelected_not_effectData {program : Program} (selected : programSelected program = true) :
    program.identity.semanticProfile ≠ portableEffectDataProfileId := by
  intro same
  simp [programSelected, same] at selected

structure ProgramAnalysis where
  entry : ParallelScopeEntry
  handlers : List String
  required : List String
  parentCount : Nat
  childCount : Nat
  parentWait : Bool
  parentEffect : Bool
  bodyFrontier : StructuredParallelBody.FrontierCapacity

structure ProgramCapacity where
  closureBound : Nat
  waits : Nat
  effects : Nat
  deriving Repr, DecidableEq

def programOperationAllowed : SemanticOperation → Bool
  | .enterParallelMultiInstanceScope .. | .completeParallelMultiInstanceScope .. => true
  | .enterSequentialMultiInstanceScope .. | .completeSequentialMultiInstanceScope .. => false
  | operation => SequentialScopeProgram.operationAllowed operation

/-- PMIS-ADMIT-01 checks the exact Program consumed by execution, including excluded hidden declarations. -/
def analyzeProgram (program : Program) : Option ProgramAnalysis := do
  if !programSelected program || program.identity.sourceOverlay.isNone ||
      program.internalSchedulingMode != .rejectObservableChoice ||
      program.definitionScopes.length != 2 || program.operations.length > 1024 ||
      program.compensationActivityRetention.isSome || program.compensationEventSubProcessSnapshots.isSome ||
      program.compensationExecution.isSome || !program.interruptingMessageEventSubProcesses.isEmpty ||
      !program.operations.all programOperationAllowed || !programWellFormed program then none
  else do
    let [entry] := program.operations.filterMap parallelScopeEntry? | none
    let [root] := program.definitionScopes.filter (·.parentScopeId.isNone) | none
    let [childScope] := program.definitionScopes.filter (·.id == entry.childScopeId) | none
    let [entryOwner] := program.operationScopes.filter (·.operationId == entry.id) | none
    if entryOwner.scopeId != root.id || childScope.parentScopeId != some root.id then none
    else do
      let owns := fun id scope => program.operationScopes.any (fun owner => owner.operationId == id && owner.scopeId == scope)
      let parent := program.operations.filter (fun operation => owns operation.id root.id)
      let child := program.operations.filter (fun operation => owns operation.id entry.childScopeId)
      let [completion] := child.filter (fun operation => match operation with
        | .completeParallelMultiInstanceScope .. => true | _ => false) | none
      let .completeParallelMultiInstanceScope _ origin paired := completion | none
      if paired != entry.id || origin.elementId != entry.elementId ||
          !(child.any fun operation => match operation with | .awaitUserTask .. => true | _ => false) ||
          !(child.any fun operation => match operation with | .awaitEffect .. => true | _ => false) then none
      else do
        let identities := program.processId.value :: program.controlPlaces.map (·.origin.elementId.value) ++
          program.operations.filterMap (fun operation => match operation with
            | .enterParallelMultiInstanceScope _ origin .. => some origin.elementId.value
            | _ => SequentialScopeProgram.sourceNode? operation)
        if identities.eraseDups.length != identities.length then none
        else do
          let _ ← SequentialScopeControl.parentWaits? parent entry.id
          let body := child.filter (·.id != completion.id)
          let first ← SequentialScopeControl.consumer? body entry.childEntry
          let vertices := ⟨entry.id.value, .start, [first]⟩ :: (← body.mapM (SequentialScopeControl.bodyVertex? body))
          let _ ← StructuredParallelBody.structureOrder vertices
          let (handlers, required) ← SequentialScopeData.requirementsFor program entry.collectionName entry.itemName
            entry.childScopeId entry.bodyInputs entry.completionBooleanName
          let effectIds := body.filterMap (fun operation => match operation with
            | .awaitEffect id .. => some id.value | _ => none)
          let width ← StructuredParallelBody.frontierCapacity vertices effectIds
          pure ⟨entry, handlers, required, parent.length, child.length,
            parent.any (fun operation => match operation with | .awaitUserTask .. | .awaitEffect .. => true | _ => false),
            parent.any (fun operation => match operation with | .awaitEffect .. => true | _ => false), width⟩

/-- Required inputs are checked before collection cardinality, including the empty collection. -/
def programStartCapacity (program : Program) (bindings : List VariableBinding) : Option ProgramCapacity := do
  let analysis ← analyzeProgram program
  if !SequentialScopeData.startBindingsAdmitted analysis.entry.collectionName analysis.entry.completionBooleanName
      analysis.handlers analysis.required bindings then none
  else do
    let [binding] := bindings.filter (·.name == analysis.entry.collectionName) | none
    let .stringList items := binding.value | none
    let waits := max (if analysis.parentWait then 1 else 0) (items.length * analysis.bodyFrontier.waits)
    let effects := max (if analysis.parentEffect then 1 else 0) (items.length * analysis.bodyFrontier.effects)
    let frontier ← boundedFrontier waits effects
    let bound ← boundedClosureBound analysis.parentCount analysis.childCount items.length
    pure ⟨bound, frontier.waits, frontier.effects⟩

/-- The retained Process collection and exact surviving controller population settle resumption capacity. -/
def programStateCapacity (program : Program) (state : RuntimeState) : Option ProgramCapacity := do
  if !committedStateCollectionAdmitted state ||
      !InternalCommutation.occurrenceReservationStateValid state then none else pure ()
  let analysis ← analyzeProgram program
  let capacity ← programStartCapacity program state.variables.process.bindings
  let [entryOwner] := program.operationScopes.filter (·.operationId == analysis.entry.id) | none
  let [collection] := state.variables.process.bindings.filter (·.name == analysis.entry.collectionName) | none
  let .stringList items := collection.value | none
  let bodies := state.scopeOccurrences.filter (·.id.definitionScopeId == analysis.entry.childScopeId)
  let frames := state.variables.scopes
  let activities := state.activityOccurrences.filter fun activity =>
    activity.activityElementId == analysis.entry.elementId || match activity.body with
      | .parallelChildScopes .. => true | _ => false
  let controllers := state.parallelScopeControllers
  match activities with
  | [] =>
      if !controllers.isEmpty || !bodies.isEmpty || !frames.isEmpty then none else some capacity
  | [activity] => do
      let .parallelChildScopes first _ := activity.body | none
      let binding ← parallelScopeBinding? analysis.entry state first.scope
      let [parent] := state.scopeOccurrences.filter (·.id == activity.owner) | none
      if binding.activity != activity || activity.owner.definitionScopeId != entryOwner.scopeId ||
          parent.parent.isSome || controllers != [binding.controller] ||
          binding.controller.total != items.length || bodies.length != binding.iterations.length ||
          frames.length != binding.iterations.length ||
          !(binding.iterations.all fun iteration => items[iteration.loopCounter]? == some iteration.item) then none
      else some capacity
  | _ => none

def commandClosureLimit? (program : Program) (state : RuntimeState) (stimulus : Stimulus) : Option Nat :=
  if !programSelected program then some scenarioClosureLimit
  else if !committedStateCollectionAdmitted state ||
      !InternalCommutation.occurrenceReservationStateValid state then none
  else match state.control, stimulus with
    | .notStarted, .startProcess _ _ _ bindings => (programStartCapacity program bindings).map (·.closureBound)
    | _, _ => (programStateCapacity program state).map (·.closureBound)

/-- An admitted parallel Multi-Instance Program has no merge target, so its scope completion stays
definition-addressed. -/
theorem analyzed_not_embedded_completion (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) :
    program.identity.semanticProfile.value ≠ "cibseven-2.2.0-embedded-subprocess-completion-draft" := by
  cases selected : programSelected program with
  | false => simp [analyzeProgram, selected] at admitted
  | true =>
      simp only [programSelected, beq_iff_eq] at selected
      rw [selected]
      decide +kernel

/-- A PMIS-admitted Program is not of the nested scope-data profile, so its scope entries and
completions are exactly the undeclared ones. -/
theorem analyzed_not_nested (program : Program) (analysis : ProgramAnalysis)
    (admitted : analyzeProgram program = some analysis) : nestedScopeDataProgram program = false := by
  cases selected : programSelected program with
  | false => simp [analyzeProgram, selected] at admitted
  | true =>
      simp only [programSelected, beq_iff_eq] at selected
      simp only [nestedScopeDataProgram, beq_eq_false_iff_ne, ne_eq]
      intro same
      rw [same] at selected
      exact absurd selected (by decide +kernel)

end BpmnSemantics.SemanticProcess.ParallelScopeStart
