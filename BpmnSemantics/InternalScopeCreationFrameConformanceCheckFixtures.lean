module

import BpmnSemantics.SemanticProcess.DefinitionBindingValidation
public import BpmnSemantics.SemanticProcess.InternalScopeCreationPreparation
public import BpmnSemantics.SemanticProcess.ControlPositionProjection
public import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcess.CheckedGraphValidation
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
public import BpmnSemantics.SemanticProcess.CallActivity
import all Init.Data.Repr
import all Init.Data.List.Sort.Basic
public import BpmnSemantics.SemanticProcess.Lowering

/-! Fixture definitions and executable checks of [`InternalScopeCreationFrameConformance`](InternalScopeCreationFrameConformance.lean), apart from its theorems so that
the check driver's closure reaches no proof owner ([AA-05](../docs/ASSURANCE-IMPROVEMENT-REGISTER.md#aa-05)). -/

@[expose] public section

namespace BpmnSemantics.InternalScopeCreationFrameConformance


open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcess.InternalCommutation

inductive Creator where
  | child
  | called
  deriving DecidableEq

def scopeA : DefinitionScopeId := ⟨"scope:A"⟩
def scopeB : DefinitionScopeId := ⟨"scope:B"⟩
def rootScope : DefinitionScopeId := ⟨"scope:Root"⟩

def definition (kind : Creator) (scope : DefinitionScopeId)
    (element : NodeId) (process : ProcessId) : DefinitionScope :=
  match kind with
  | .child => { id := scope, parentScopeId := some rootScope, originElementId := element }
  | .called => { id := scope, parentScopeId := none, originElementId := ⟨process.value⟩ }

def creatorNode (kind : Creator) (element : NodeId)
    (scope : DefinitionScopeId) (process : ProcessId) : CheckedNode :=
  match kind with
  | .child => .embeddedSubProcess element scope
  | .called => .callActivity element process

def checked (left right : Creator) : CheckedProcess :=
  { identity :=
      { semanticProfile := ⟨"bpmn-2.0.2-called-process-call-activity-draft"⟩
        sourceId := ⟨"constructed-scope-creation-frame"⟩
        sourceSha256 := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    processId := ⟨"Root"⟩
    definitionScopes :=
      [definition left scopeA ⟨"C_Left"⟩ ⟨"A_Callee"⟩,
       definition right scopeB ⟨"D_Right"⟩ ⟨"B_Callee"⟩,
       { id := rootScope, parentScopeId := none, originElementId := ⟨"Root"⟩ }]
    nodeScopes :=
      [{ nodeId := ⟨"A_Start"⟩, scopeId := rootScope },
       { nodeId := ⟨"B_Fork"⟩, scopeId := rootScope },
       { nodeId := ⟨"C_Left"⟩, scopeId := rootScope },
       { nodeId := ⟨"D_Right"⟩, scopeId := rootScope },
       { nodeId := ⟨"E_Join"⟩, scopeId := rootScope },
       { nodeId := ⟨"F_End"⟩, scopeId := rootScope },
       { nodeId := ⟨"G_StartA"⟩, scopeId := scopeA },
       { nodeId := ⟨"H_EndA"⟩, scopeId := scopeA },
       { nodeId := ⟨"I_StartB"⟩, scopeId := scopeB },
       { nodeId := ⟨"J_EndB"⟩, scopeId := scopeB }]
    sequenceFlowScopes :=
      [{ sequenceFlowId := ⟨"f01"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f02"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f03"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f04"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f05"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f06"⟩, scopeId := rootScope },
       { sequenceFlowId := ⟨"f07"⟩, scopeId := scopeA },
       { sequenceFlowId := ⟨"f08"⟩, scopeId := scopeB }]
    nodes :=
      [.noneStartEvent ⟨"A_Start"⟩, .parallelGateway ⟨"B_Fork"⟩ .diverging,
       creatorNode left ⟨"C_Left"⟩ scopeA ⟨"A_Callee"⟩,
       creatorNode right ⟨"D_Right"⟩ scopeB ⟨"B_Callee"⟩,
       .parallelGateway ⟨"E_Join"⟩ .converging, .noneEndEvent ⟨"F_End"⟩,
       .noneStartEvent ⟨"G_StartA"⟩, .noneEndEvent ⟨"H_EndA"⟩,
       .noneStartEvent ⟨"I_StartB"⟩, .noneEndEvent ⟨"J_EndB"⟩]
    sequenceFlows :=
      [{ id := ⟨"f01"⟩, sourceId := ⟨"A_Start"⟩, targetId := ⟨"B_Fork"⟩ },
       { id := ⟨"f02"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"C_Left"⟩ },
       { id := ⟨"f03"⟩, sourceId := ⟨"B_Fork"⟩, targetId := ⟨"D_Right"⟩ },
       { id := ⟨"f04"⟩, sourceId := ⟨"C_Left"⟩, targetId := ⟨"E_Join"⟩ },
       { id := ⟨"f05"⟩, sourceId := ⟨"D_Right"⟩, targetId := ⟨"E_Join"⟩ },
       { id := ⟨"f06"⟩, sourceId := ⟨"E_Join"⟩, targetId := ⟨"F_End"⟩ },
       { id := ⟨"f07"⟩, sourceId := ⟨"G_StartA"⟩, targetId := ⟨"H_EndA"⟩ },
       { id := ⟨"f08"⟩, sourceId := ⟨"I_StartB"⟩, targetId := ⟨"J_EndB"⟩ }] }

def program (left right : Creator) : Program := lowerCheckedProcess (checked left right)

def owner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"frame-instance"⟩, definitionScopeId := rootScope, activation := 1 }

def before : RuntimeState :=
  { initialState with
    control := .running owner.processInstanceId
    scopeOccurrences := [{ id := owner, parent := none }]
    scopeActivations := [{ scopeId := scopeA, count := 9 },
      { scopeId := scopeB, count := 19 }, { scopeId := rootScope, count := 1 }]
    callActivations := [{ elementId := ⟨"C_Left"⟩, count := 9 },
      { elementId := ⟨"D_Right"⟩, count := 19 }]
    tokens := [{ placeId := flowControlPlaceId ⟨"f02"⟩, owner },
      { placeId := flowControlPlaceId ⟨"f03"⟩, owner }]
    logicalTimeMs := 42 }

def preparation (program : Program) (state : RuntimeState) (element : NodeId) :
    Option PreparedInternalScopeCreation := do
  let operation ← program.operations.find? fun operation =>
    match operation with
    | .enterScope _ origin .. | .invokeProcess _ origin .. => origin.elementId == element
    | _ => false
  prepareInternalScopeCreation? program state operation

def pairPreconditions (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right => localControlStateFootprintsNonInterfering left.footprint right.footprint
  | _, _ => false

def pairFrames (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right =>
      preparation program (right.selection.apply before) ⟨"C_Left"⟩ == some left &&
        preparation program (left.selection.apply before) ⟨"D_Right"⟩ == some right
  | _, _ => false

def pairCommutes (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right =>
      let leftThenRight := right.selection.apply (left.selection.apply before)
      let rightThenLeft := left.selection.apply (right.selection.apply before)
      leftThenRight == rightThenLeft &&
        runtimeStateWellFormed program owner.processInstanceId leftThenRight &&
        runtimeStateWellFormed program owner.processInstanceId rightThenLeft
  | _, _ => false

def constructed_pairs_remain_outside_profile_admission : Bool := decide <|
    programProfileCapabilitiesValid (program .child .child) = false ∧
    programProfileCapabilitiesValid (program .child .called) = false ∧
    programProfileCapabilitiesValid (program .called .called) = false

def child_call_complete_preparations_survive_both_orders : Bool := decide <|
    pairFrames (program .child .called) = true

def call_call_complete_preparations_survive_both_orders : Bool := decide <|
    pairFrames (program .called .called) = true

def child_child_complete_states_commute_and_remain_valid : Bool := decide <|
    pairCommutes (program .child .child) = true

def child_call_complete_states_commute_and_remain_valid : Bool := decide <|
    pairCommutes (program .child .called) = true

def call_call_complete_states_commute_and_remain_valid : Bool := decide <|
    pairCommutes (program .called .called) = true

def positionPublicationMatches (program : Program) (state : RuntimeState)
    (element : NodeId) : Bool :=
  match preparation program state element with
  | none => false
  | some prepared => controlPositionDelta? program owner.processInstanceId state
      (prepared.selection.apply state) == some prepared.publicationTemplate.positionDelta

def child_creation_publishes_exact_position_delta : Bool := decide <|
    positionPublicationMatches (program .child .child) before ⟨"C_Left"⟩ = true

def call_creation_publishes_exact_position_delta : Bool := decide <|
    positionPublicationMatches (program .called .called) before ⟨"C_Left"⟩ = true

def repeatedInput : RuntimeState :=
  { before with tokens := addToken before.tokens (flowControlPlaceId ⟨"f02"⟩) owner }

def child_publication_distinguishes_produced_owner_and_scope_parent : Bool := decide <|
    (match preparation (program .child .child) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let delta := prepared.publicationTemplate.positionDelta
         let actual := controlPositionDelta? (program .child .child) owner.processInstanceId
           before (prepared.selection.apply before)
         let wrongOwner := { delta with
           producedTokens := delta.producedTokens.map (fun token => { token with owner }) }
         let wrongParent := { delta with
           enteredScopes := delta.enteredScopes.map (fun scope => { scope with parent := none }) }
         actual != some wrongOwner && actual != some wrongParent) = true

def equal_call_sort_keys_do_not_identify_retained_payloads : Bool := decide <|
    (match preparation (program .called .called) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         match prepared.selection.kind with
         | .child => false
         | .called record =>
             let alias := { record with returnOperationId := ⟨"different-return"⟩ }
             !callRecordBefore record alias && !callRecordBefore alias record &&
               sortCallRecords [record, alias] != sortCallRecords [alias, record] &&
               !calledProcessAssociationsValid
                 { prepared.selection.apply before with calledProcessOccurrences := [record, alias] }) = true

def child_definition_population_excludes_a_different_occurrence_identity : Bool := decide <|
    (match preparation (program .child .child) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let created := prepared.selection.created
         let alias := { created with id := { created.id with activation := created.id.activation + 1 } }
         let altered := { before with scopeOccurrences := insertScopeOccurrence alias before.scopeOccurrences }
         !(altered.scopeOccurrences.any fun scope => scope.id == created.id) &&
           selectInternalScopeCreation? altered prepared.selection.operation == none) = true

def call_instance_population_excludes_a_different_scope_identity : Bool := decide <|
    (match preparation (program .called .called) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let created := prepared.selection.created
         let alias : RuntimeScopeOccurrence :=
           { id := { created.id with definitionScopeId := scopeB, activation := 2 }
             parent := some owner }
         let altered := { before with scopeOccurrences := insertScopeOccurrence alias before.scopeOccurrences }
         calledProcessAssociationsValid altered &&
           !(altered.scopeOccurrences.any fun scope => scope.id == created.id) &&
           selectInternalScopeCreation? altered prepared.selection.operation == none) = true

def child_issuance_change_alters_the_complete_preparation : Bool := decide <|
    (match preparation (program .child .child) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let altered := { before with scopeActivations := setScopeActivationCount before.scopeActivations scopeA 10 }
         let next := preparation (program .child .child) altered ⟨"C_Left"⟩
         next.isSome && next != some prepared) = true

def call_issuance_change_alters_the_complete_preparation : Bool := decide <|
    (match preparation (program .called .called) before ⟨"C_Left"⟩ with
     | none => false
     | some prepared =>
         let altered := { before with callActivations := setCallActivationCount before ⟨"C_Left"⟩ 10 }
         let next := preparation (program .called .called) altered ⟨"C_Left"⟩
         next.isSome && next != some prepared) = true

def lifecyclePublicationMatches (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalScopeCreation) (index : Nat) : Bool :=
  let after := prepared.selection.apply state
  prepared.publicationTemplate.lifecycle.started.length == 1 &&
    prepared.publicationTemplate.lifecycle.ended.isEmpty &&
    flowNodeOccurrenceDeltaForOperation? program state after prepared.selection.operation
      ⟨"scope-frame-command"⟩ index == some prepared.publicationTemplate.lifecycle

def pairLifecycleMatches (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩, preparation program before ⟨"D_Right"⟩ with
  | some left, some right =>
      let afterLeft := left.selection.apply before
      let afterRight := right.selection.apply before
      let leftThenRight := right.selection.apply afterLeft
      let rightThenLeft := left.selection.apply afterRight
      let expected := sortFlowNodeOccurrenceStarts
        (left.publicationTemplate.lifecycle.started ++ right.publicationTemplate.lifecycle.started)
      lifecyclePublicationMatches program before left 7 &&
        lifecyclePublicationMatches program afterLeft right 8 &&
        lifecyclePublicationMatches program before right 7 &&
        lifecyclePublicationMatches program afterRight left 8 &&
        expected.length == 2 &&
        projectOpenFlowNodeOccurrences? program leftThenRight == some expected &&
        projectOpenFlowNodeOccurrences? program rightThenLeft == some expected
  | _, _ => false

def child_child_lifecycle_is_accepted_in_both_orders : Bool := decide <|
    pairLifecycleMatches (program .child .child) = true

def child_call_lifecycle_is_accepted_in_both_orders : Bool := decide <|
    pairLifecycleMatches (program .child .called) = true

def call_call_lifecycle_is_accepted_in_both_orders : Bool := decide <|
    pairLifecycleMatches (program .called .called) = true

def alteredLifecycleRefused (program : Program) : Bool :=
  match preparation program before ⟨"C_Left"⟩ with
  | none => false
  | some prepared =>
      let after := prepared.selection.apply before
      let delta := prepared.publicationTemplate.lifecycle
      let accepts := acceptFlowNodeOccurrenceCandidate? program before after
      let wrongAnchor : OccurrenceId :=
        { processInstanceId := owner.processInstanceId, elementId := ⟨"wrong-anchor"⟩, activation := 1 }
      accepts delta == some delta &&
        (accepts { delta with started := [] }).isNone &&
        (accepts { delta with started := delta.started ++ delta.started }).isNone &&
        (accepts { delta with started := delta.started.map fun start =>
          { start with processId := ⟨"wrong-process"⟩ } }).isNone &&
        (accepts { delta with started := delta.started.map fun start =>
          { start with owner := prepared.selection.created.id } }).isNone &&
        (accepts { delta with started := delta.started.map fun start =>
          { start with anchor := .wait wrongAnchor } }).isNone

def child_lifecycle_rejects_missing_duplicate_and_wrong_identity_starts : Bool := decide <|
    alteredLifecycleRefused (program .child .child) = true

def call_lifecycle_rejects_missing_duplicate_and_wrong_identity_starts : Bool := decide <|
    alteredLifecycleRefused (program .called .called) = true

/-- Every executable check of this module, named for the driver's failure report. -/
def child_child_complete_preparations_survive_both_orders : Bool := decide <|
    pairFrames (program .child .child) = true

def call_creation_still_refuses_repeated_input : Bool := decide <|
    preparation (program .called .called) repeatedInput ⟨"C_Left"⟩ = none

def checks : List (String × Bool) := [
  ("constructed_pairs_remain_outside_profile_admission", constructed_pairs_remain_outside_profile_admission),
  ("child_call_complete_preparations_survive_both_orders", child_call_complete_preparations_survive_both_orders),
  ("call_call_complete_preparations_survive_both_orders", call_call_complete_preparations_survive_both_orders),
  ("child_child_complete_states_commute_and_remain_valid", child_child_complete_states_commute_and_remain_valid),
  ("child_call_complete_states_commute_and_remain_valid", child_call_complete_states_commute_and_remain_valid),
  ("call_call_complete_states_commute_and_remain_valid", call_call_complete_states_commute_and_remain_valid),
  ("child_creation_publishes_exact_position_delta", child_creation_publishes_exact_position_delta),
  ("call_creation_publishes_exact_position_delta", call_creation_publishes_exact_position_delta),
  ("child_publication_distinguishes_produced_owner_and_scope_parent", child_publication_distinguishes_produced_owner_and_scope_parent),
  ("equal_call_sort_keys_do_not_identify_retained_payloads", equal_call_sort_keys_do_not_identify_retained_payloads),
  ("child_definition_population_excludes_a_different_occurrence_identity", child_definition_population_excludes_a_different_occurrence_identity),
  ("call_instance_population_excludes_a_different_scope_identity", call_instance_population_excludes_a_different_scope_identity),
  ("child_issuance_change_alters_the_complete_preparation", child_issuance_change_alters_the_complete_preparation),
  ("call_issuance_change_alters_the_complete_preparation", call_issuance_change_alters_the_complete_preparation),
  ("child_child_lifecycle_is_accepted_in_both_orders", child_child_lifecycle_is_accepted_in_both_orders),
  ("child_call_lifecycle_is_accepted_in_both_orders", child_call_lifecycle_is_accepted_in_both_orders),
  ("call_call_lifecycle_is_accepted_in_both_orders", call_call_lifecycle_is_accepted_in_both_orders),
  ("child_lifecycle_rejects_missing_duplicate_and_wrong_identity_starts", child_lifecycle_rejects_missing_duplicate_and_wrong_identity_starts),
  ("call_lifecycle_rejects_missing_duplicate_and_wrong_identity_starts", call_lifecycle_rejects_missing_duplicate_and_wrong_identity_starts),
  ("child_child_complete_preparations_survive_both_orders", child_child_complete_preparations_survive_both_orders),
  ("call_creation_still_refuses_repeated_input", call_creation_still_refuses_repeated_input)
]

end BpmnSemantics.InternalScopeCreationFrameConformance
