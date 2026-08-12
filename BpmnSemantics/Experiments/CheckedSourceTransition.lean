import BpmnSemantics.Experiments.CheckedSourceState

/-! # Checked-source transitions

This module owns the provisional checked-node relation, executable selector, stimulus admission, and bounded closure. It is written directly in BPMN checked-graph vocabulary and does not depend on Semantic Process lowering or execution.
-/

namespace BpmnSemantics.Experiments.CheckedSourceSemantics

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- Direct checked-node relation in BPMN vocabulary. -/
inductive NodeStep (source : CheckedProcess) :
    CheckedNode → SourceRuntimeState → SourceRuntimeState → Prop where
  | noneStartEvent (id : NodeId) (state : SourceRuntimeState)
      (pending : state.initiationPending = true) :
      NodeStep source (.noneStartEvent id) state
        { state with
          initiationPending := false
          tokens := firstFlowId (outgoingFlowIds source id) :: state.tokens }
  | userTask (id : NodeId) (name : Option String)
      (state : SourceRuntimeState) (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled :
        hasToken state (firstFlowId (incomingFlowIds source id)) = true) :
      NodeStep source (.userTask id name) state
        (activateUserTask state instanceId id name
          (firstFlowId (incomingFlowIds source id))
          (firstFlowId (outgoingFlowIds source id)))
  | parallelFork (id : NodeId) (state : SourceRuntimeState)
      (enabled :
        hasToken state (firstFlowId (incomingFlowIds source id)) = true) :
      NodeStep source (.parallelGateway id .diverging) state
        (duplicateToken state
          (firstFlowId (incomingFlowIds source id))
          (outgoingFlowIds source id))
  | parallelJoin (id : NodeId) (state : SourceRuntimeState)
      (enabled : (incomingFlowIds source id).all (hasToken state) = true) :
      NodeStep source (.parallelGateway id .converging) state
        (synchronizeTokens state
          (incomingFlowIds source id)
          (firstFlowId (outgoingFlowIds source id)))
  | noneEndEvent (id : NodeId) (state : SourceRuntimeState)
      (instanceId : SemanticId)
      (running : state.control = .running instanceId)
      (enabled :
        hasToken state (firstFlowId (incomingFlowIds source id)) = true) :
      NodeStep source (.noneEndEvent id) state
        (terminateToken state instanceId
          (firstFlowId (incomingFlowIds source id)))

/-- Executable selector for one checked node. It does not select a node by collection order. -/
def fireNode? (source : CheckedProcess) (node : CheckedNode)
    (state : SourceRuntimeState) : Option SourceRuntimeState :=
  match node with
  | .noneStartEvent id =>
      if state.initiationPending then
        some
          { state with
            initiationPending := false
            tokens :=
              firstFlowId (outgoingFlowIds source id) :: state.tokens }
      else none
  | .messageStartEvent .. => none
  | .timerStartEvent .. => none
  | .userTask id name none =>
      match state.control with
      | .running instanceId =>
          let input := firstFlowId (incomingFlowIds source id)
          if hasToken state input then
            some
              (activateUserTask state instanceId id name input
                (firstFlowId (outgoingFlowIds source id)))
          else none
      | .notStarted
      | .completed _ => none
  | .userTask _ _ (some _) => none
  | .intermediateCatchTimerEvent _ _ => none
  | .intermediateCatchMessageEvent _ _ => none
  | .receiveTask _ _ => none
  | .configuredTask _ _ => none
  | .serviceTask _ _ _ _ _ => none
  | .embeddedSubProcess _ _ => none
  | .callActivity _ _ => none
  | .boundaryErrorEvent .. => none
  | .timerBoundaryEvent .. => none
  | .errorEndEvent .. => none
  | .terminateEndEvent .. => none
  | .exclusiveMerge _ => none
  | .exclusiveGateway _ _ _ => none
  | .inclusiveGatewayDiverging _ _ _ => none
  | .inclusiveGatewayConverging _ _ => none
  | .eventBasedGateway _ => none
  | .parallelGateway id .diverging =>
      let input := firstFlowId (incomingFlowIds source id)
      if hasToken state input then
        some
          (duplicateToken state input (outgoingFlowIds source id))
      else none
  | .parallelGateway id .converging =>
      let inputs := incomingFlowIds source id
      if inputs.all (hasToken state) then
        some
          (synchronizeTokens state inputs
            (firstFlowId (outgoingFlowIds source id)))
      else none
  | .noneEndEvent id =>
      match state.control with
      | .running instanceId =>
          let input := firstFlowId (incomingFlowIds source id)
          if hasToken state input then
            some (terminateToken state instanceId input)
          else none
      | .notStarted
      | .completed _ => none

theorem fireNode_sound (source : CheckedProcess) (node : CheckedNode)
    (before after : SourceRuntimeState)
    (result : fireNode? source node before = some after) :
    NodeStep source node before after := by
  cases node with
  | noneStartEvent id =>
      by_cases pending : before.initiationPending = true
      · simp [fireNode?, pending] at result
        subst after
        exact .noneStartEvent id before pending
      · simp [fireNode?, pending] at result
  | messageStartEvent id channel =>
      simp [fireNode?] at result
  | timerStartEvent id durationLiteral =>
      simp [fireNode?] at result
  | userTask id name metadata =>
      cases metadata with
      | none =>
          cases controlEq : before.control with
          | notStarted => simp [fireNode?, controlEq] at result
          | completed instanceId => simp [fireNode?, controlEq] at result
          | running instanceId =>
              by_cases enabled :
                  hasToken before
                    (firstFlowId (incomingFlowIds source id)) = true
              · simp [fireNode?, controlEq, enabled] at result
                subst after
                exact .userTask id name before instanceId controlEq enabled
              · simp [fireNode?, controlEq, enabled] at result
      | some metadata => simp [fireNode?] at result
  | intermediateCatchTimerEvent id durationLiteral =>
      simp [fireNode?] at result
  | intermediateCatchMessageEvent id channel =>
      simp [fireNode?] at result
  | receiveTask id channel =>
      simp [fireNode?] at result
  | configuredTask id descriptor =>
      simp [fireNode?] at result
  | serviceTask id descriptor inputMappings outputMappings bpmnErrorRoute =>
      simp [fireNode?] at result
  | embeddedSubProcess id scopeId =>
      simp [fireNode?] at result
  | callActivity id calledElement =>
      simp [fireNode?] at result
  | boundaryErrorEvent id attachedToRef error outputFlowId =>
      simp [fireNode?] at result
  | timerBoundaryEvent id attachedToRef durationLiteral outputFlowId =>
      simp [fireNode?] at result
  | errorEndEvent id error =>
      simp [fireNode?] at result
  | terminateEndEvent id =>
      simp [fireNode?] at result
  | exclusiveMerge id =>
      simp [fireNode?] at result
  | exclusiveGateway id candidateFlowIds defaultFlowId =>
      simp [fireNode?] at result
  | inclusiveGatewayDiverging id candidateFlowIds defaultFlowId =>
      simp [fireNode?] at result
  | inclusiveGatewayConverging id pairedGatewayId =>
      simp [fireNode?] at result
  | eventBasedGateway id =>
      simp [fireNode?] at result
  | parallelGateway id direction =>
      cases direction with
      | diverging =>
          by_cases enabled :
              hasToken before (firstFlowId (incomingFlowIds source id)) = true
          · simp [fireNode?, enabled] at result
            subst after
            exact .parallelFork id before enabled
          · simp [fireNode?, enabled] at result
      | converging =>
          by_cases enabled :
              (incomingFlowIds source id).all (hasToken before) = true
          · simp [fireNode?, enabled] at result
            subst after
            exact .parallelJoin id before enabled
          · simp [fireNode?, enabled] at result
  | noneEndEvent id =>
      cases controlEq : before.control with
      | notStarted => simp [fireNode?, controlEq] at result
      | completed instanceId => simp [fireNode?, controlEq] at result
      | running instanceId =>
          by_cases enabled :
              hasToken before (firstFlowId (incomingFlowIds source id)) = true
          · simp [fireNode?, controlEq, enabled] at result
            subst after
            exact .noneEndEvent id before instanceId controlEq enabled
          · simp [fireNode?, controlEq, enabled] at result

def completeUserTask (state : SourceRuntimeState)
    (processInstanceId : SemanticId) (nodeId : NodeId)
    (activation : Nat) : Option SourceRuntimeState :=
  match state.waits.find? fun wait =>
      decide (
        wait.processInstanceId = processInstanceId &&
          wait.taskNodeId = nodeId &&
          wait.activation = activation) with
  | none => none
  | some wait =>
      some
        { state with
          waits := state.waits.erase wait
          tokens := wait.output :: state.tokens }

structure ExternalAdmission where
  outcome : CommandOutcome
  state : SourceRuntimeState
  deriving Repr, DecidableEq

def admitStimulus (source : CheckedProcess) (state : SourceRuntimeState) :
    Stimulus → ExternalAdmission
  | .startProcess _ processId instanceId _ =>
      match state.control with
      | .notStarted =>
          if source.processId.value = processId.value then
            { outcome := .committed, state := runningStartState instanceId }
          else
            { outcome := .rejected, state }
      | .running _
      | .completed _ => { outcome := .rejected, state }
  | .triggerMessageStart .. => { outcome := .unsupported, state }
  | .triggerTimerStart .. => { outcome := .unsupported, state }
  | .completeUserTaskInstance _ taskId _ =>
      match state.control with
      | .running instanceId =>
          match completeUserTask state taskId.processInstanceId
              ⟨taskId.elementId.value⟩ taskId.activation with
          | some successor =>
              if taskId.processInstanceId = instanceId then
                { outcome := .committed, state := successor }
              else
                { outcome := .rejected, state }
          | none => { outcome := .rejected, state }
      | .notStarted
      | .completed _ => { outcome := .rejected, state }
  | .fireTimer _ _ _ => { outcome := .unsupported, state }
  | .deliverMessage _ _ _ => { outcome := .unsupported, state }
  | .completeEffect _ _ _ => { outcome := .unsupported, state }

def enabledTransitions (source : CheckedProcess)
    (state : SourceRuntimeState) :
    List (CheckedNode × SourceRuntimeState) :=
  source.nodes.filterMap fun node =>
    (fireNode? source node state).map fun successor => (node, successor)

def independentParallelTaskChoices (source : CheckedProcess) :
    List (CheckedNode × SourceRuntimeState) → Bool
  | [(.userTask idA _, _), (.userTask idB _, _)] =>
      decide (
        firstFlowId (incomingFlowIds source idA) ≠
            firstFlowId (incomingFlowIds source idB) ∧
          firstFlowId (outgoingFlowIds source idA) ≠
            firstFlowId (outgoingFlowIds source idB) ∧
          idA ≠ idB)
  | _ => false

structure ClosureResult where
  state : SourceRuntimeState
  hitBound : Bool
  ambiguousChoice : Bool
  deriving Repr, DecidableEq

def closeSupported : Nat → CheckedProcess → SourceRuntimeState →
    ClosureResult
  | 0, source, state =>
      match enabledTransitions source state with
      | [] => { state, hitBound := false, ambiguousChoice := false }
      | [_]
      | _ :: _ :: _ =>
          { state, hitBound := true, ambiguousChoice := false }
  | fuel + 1, source, state =>
      match enabledTransitions source state with
      | [] => { state, hitBound := false, ambiguousChoice := false }
      | [(_, successor)] => closeSupported fuel source successor
      | first :: second :: remaining =>
          let transitions := first :: second :: remaining
          if independentParallelTaskChoices source transitions then
            closeSupported fuel source first.2
          else
            { state, hitBound := false, ambiguousChoice := true }

structure StimulusResult where
  outcome : CommandOutcome
  state : SourceRuntimeState
  internalStepBoundExceeded : Bool
  ambiguousInternalChoice : Bool
  deriving Repr, DecidableEq

def applyStimulus (closureLimit : Nat) (source : CheckedProcess)
    (state : SourceRuntimeState) (stimulus : Stimulus) : StimulusResult :=
  let admission := admitStimulus source state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeSupported closureLimit source admission.state
      { outcome := .committed
        state := closure.state
        internalStepBoundExceeded := closure.hitBound
        ambiguousInternalChoice := closure.ambiguousChoice }
  | .rolledBack =>
      { outcome := .rolledBack
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .rejected =>
      { outcome := .rejected
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .semanticFailure =>
      { outcome := .semanticFailure
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }
  | .unsupported =>
      { outcome := .unsupported
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

end BpmnSemantics.Experiments.CheckedSourceSemantics
