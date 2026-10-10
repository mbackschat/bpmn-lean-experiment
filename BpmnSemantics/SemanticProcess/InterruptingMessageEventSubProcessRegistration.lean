import BpmnSemantics.SemanticProcess.ActivityOccurrence
import BpmnSemantics.SemanticProcess.InterruptingMessageEventSubProcessAdmission
import BpmnSemantics.WireNatural

/-! Parent-owned Message listener registration for IMES-ARM-01. This owner reserves the exact shared
Message identity without creating an executing handler; command admission owns when registration runs. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- IMES-ARM-01 issues the Start identity from the shared Message counter family. -/
def eventSubProcessListenerId (declaration : InterruptingMessageEventSubProcessDeclaration)
    (parent : ScopeOccurrenceId) (previous : Nat) : MessageSubscriptionId :=
  { processInstanceId := parent.processInstanceId
    elementId := ⟨declaration.startEventId.value⟩
    activation := previous + 1 }

def eventSubProcessMessageCount? (state : RuntimeState) (element : NodeId) : Option Nat :=
  match state.messageActivations.filter (fun counter => counter.elementId == element) with
  | [] => some 0
  | [counter] => some counter.count
  | _ => none

/-- Registration changes the passive collection and its issuance history only; no child scope is created. -/
def installEventSubProcessListener (state : RuntimeState)
    (declaration : InterruptingMessageEventSubProcessDeclaration)
    (parent : ScopeOccurrenceId) (previous : Nat) : RuntimeState :=
  { state with
    eventSubProcessMessageSubscriptions := [{
      id := eventSubProcessListenerId declaration parent previous
      owner := parent
      channel := declaration.channel }]
    messageActivations := setMessageActivationCount state.messageActivations
      declaration.startEventId (previous + 1) }

/-- Select the listener's parent and fresh identity before the atomic registration rewrite. -/
def registerEventSubProcessListener? (program : Program) (state : RuntimeState)
    (parent : ScopeOccurrenceId) : Option RuntimeState := do
  match program.interruptingMessageEventSubProcesses with
  | [] => some state
  | [declaration] =>
    if program.identity.semanticProfile ≠ interruptingMessageEventSubProcessProfileId then none
    else if declaration.parentScopeId ≠ parent.definitionScopeId then none
    else if state.control ≠ .running parent.processInstanceId then none
    else if !state.eventSubProcessMessageSubscriptions.isEmpty then none
    else if (state.scopeOccurrences.filter (fun occurrence => occurrence.id == parent)).length ≠ 1 then none
    else if state.scopeOccurrences.any (fun occurrence =>
        occurrence.id.definitionScopeId == declaration.handlerScopeId) then none
    else
      let previous ← eventSubProcessMessageCount? state declaration.startEventId
      if previous + 1 > SemanticProcessJson.maxSafeWireNat then none
      else if state.messageWaits.any ((messageIdNamesWait { processInstanceId := parent.processInstanceId, elementId := ⟨declaration.startEventId.value⟩, activation := previous + 1 })) then none
      else some (installEventSubProcessListener state declaration parent previous)
  | _ => none

end BpmnSemantics.SemanticProcess
