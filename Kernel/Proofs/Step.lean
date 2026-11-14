module

public import Kernel.Laws.Step
public import Kernel.Laws.Registry
public import Kernel.Laws.Flow
public import Kernel.Laws.Data
public import Kernel.Laws.Hooks
public import Kernel.Proofs.State

/-! # Proofs: composition over the registered hooks

The proof wave's composition module ([PLAN, proof wave](../../docs/PLAN.md#proof-wave)): it instantiates the
`Step`-generic facts of `Kernel.Laws.Step` with the registered hooks of `Kernel.Laws.Registry` and the feature lemmas
of each `Kernel.Laws.<F>`, and opens no body. Each lane's statement is stated over a hooks parameter at the head of its
own `Kernel.Proofs.<Lane>` module and proved there from hook contracts; a lane closes when this module proves its
statement of `Registry.hooks`. The registered hooks' contract (`Laws.Step.HookContract`) is assembled here, one field
per hook, from each feature's lemma and the operations record the feature states, which this module fills from
`Laws.Step.Operations` and `Laws.Step.StateFacts`. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Step

open Kernel

/-- A flow token moved into an Exclusive Gateway leaves exactly the flows `Laws.Flow.ExclusiveTakes` allows (BPMN 2.0.2
§13.4.2, Table 13.2): the micro-step's body begins a fresh occurrence of the Gateway on that flow in the token's scope
occurrence and enqueues its completion, and nothing else, on the first candidate whose condition holds, else the default.
Each condition reads the variables visible from the token's scope occurrence and the logical time of the state the token
arrived in, so beginning the occurrence changes nothing a condition reads. -/
def ExclusiveArrival : Prop :=
  ∀ (ctx : Ctx) (flow : FlowId) (scope : ScopeOccurrenceId) (gateway : ElementId) (header : Header)
    (payload : GatewayPayload) (candidates : List FlowId) (default : Option FlowId) (state after : State),
    ctx.program.target? flow = some gateway →
    ctx.program.element? gateway = some (.gateway header payload) →
    payload.kind = .exclusive candidates default →
    Step.moveToken Registry.hooks ctx (.flow flow scope) state = .ok after →
    ∃ next sourceType begun occurrence taken evaluated,
      Step.arrive Registry.hooks ctx flow scope state = .ok next ∧
      state.beginOccurrence { element := gateway, scope, incoming := some flow }
        (Step.roleOf ctx.program { element := gateway, scope, incoming := some flow }) sourceType = (begun, occurrence) ∧
      occurrence.element = gateway ∧ occurrence.scope = scope ∧ occurrence.incoming = some flow ∧
      next = begun.signal (.complete occurrence.id (.flows taken) [] .outward) ∧
      Laws.Flow.ExclusiveTakes candidates default
        (Laws.Flow.candidateHolds ctx { variables := state.visible ctx.program scope, nowMs := state.logicalTimeMs })
        evaluated (some taken)

/-- The representative theorem of P0: `Step`'s token routing and dispatch (`Laws.Step`), the registered Gateway hook
(`Laws.Registry`), Flow's Exclusive Gateway lemma (`Laws.Flow`) and what a condition reads (`Laws.Hooks`,
`Laws.State`), composed without opening a body. -/
theorem exclusiveArrival : ExclusiveArrival := by
  intro ctx flow scope gateway header payload candidates default state after target element kind ran
  obtain ⟨next, _, arrived, _⟩ := Laws.Step.microStep_ok (Laws.Step.moveToken_flow ran)
  obtain ⟨reached, reachedTarget, begun_⟩ := Laws.Step.arrive_ok arrived
  have same : reached = gateway := Option.some.inj (reachedTarget.symm.trans target)
  subst same
  obtain ⟨sourceType, begun, occurrence, ⟨_, made, dispatched⟩⟩ := Laws.Step.begin_ok begun_
  have fresh := Laws.State.beginOccurrence_fresh (state := state) (sourceType := sourceType)
    (role := Step.roleOf ctx.program { element := reached, scope, incoming := some flow })
    (request := { element := reached, scope, incoming := some flow }) (by simp)
  have keeps := Laws.State.beginOccurrence_keeps state { element := reached, scope, incoming := some flow }
    (Step.roleOf ctx.program { element := reached, scope, incoming := some flow }) sourceType
  simp only [made] at fresh keeps
  obtain ⟨isGateway, inScope, onFlow, _⟩ := fresh
  obtain ⟨scopes, variables, time⟩ := keeps
  rw [Laws.Step.dispatch_gateway (isGateway ▸ element), Laws.Registry.hooks_arriveGateway] at dispatched
  obtain ⟨taken, evaluated, signalled, takes⟩ := Laws.Flow.arriveGateway_exclusive kind dispatched
  rw [inScope, Laws.Hooks.evalContext_eq, Laws.State.visible_congr scopes variables, time] at takes
  exact ⟨next, sourceType, begun, occurrence, taken, evaluated, arrived, made, isGateway, inScope, onFlow, signalled,
    takes⟩

/-! ## The registered hooks' contract -/

section Contract

open Kernel.Laws.Step (Operations StateFacts ScopeStands PipelineFrame)

variable {inv : State → Prop}

/-- Data's operations record (`Laws.Data.StateOps`), from the root's. -/
theorem dataOps (ops : Operations inv) (facts : StateFacts) : Laws.Data.StateOps inv where
  housed := ops.variablesHoused
  rooted := ops.rootStands
  set := ops.setVariable
  remove := ops.removeVariable
  setFrame := facts.setVariable
  removeFrame := facts.removeVariable
  declaring := facts.declaring
  owner := facts.owner
  instanceRoot := facts.instanceRoot

/-- `HookContract.writeOutputs` of the registered hooks. -/
theorem registered_writeOutputs (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope writes rule state after, inv state → ScopeStands state scope →
      Registry.hooks.writeOutputs ctx scope writes rule state = .ok after → inv after ∧ PipelineFrame state after := by
  intro ctx scope writes rule state after holds stands ran
  rw [Laws.Registry.hooks_writeOutputs] at ran
  obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Data.writeOutputs_keeps (dataOps ops facts) holds stands ran
  exact ⟨kept, scopes, fun occurrence member _ => occurrences ▸ member, fun item member => items ▸ member⟩

/-- `HookContract.removeVariables` of the registered hooks. -/
theorem registered_removeVariables (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope names state after, inv state → ScopeStands state scope →
      Registry.hooks.removeVariables ctx scope names state = .ok after → inv after := by
  intro ctx scope names state after holds _ ran
  rw [Laws.Registry.hooks_removeVariables] at ran
  exact Laws.Data.removeVariables_keeps (dataOps ops facts) holds ran

end Contract

/-! ## The phases that queue a signal

`Laws.State.signal_queueSound` asks which signal a phase queues, which only `Signal`'s owners may tell. -/

/-- A start's fresh instance, with its root's Event Sub-Process starts queued for arming (`Laws.Step.Phases.initial`). -/
theorem initial_wellFormed (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    Laws.State.WellFormed ((State.initial instanceId variables businessKey).signal (.armScope State.root)) :=
  have formed := Laws.State.initial_wellFormed instanceId variables businessKey
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by cases same; exact Laws.State.initial_rootIssued instanceId variables businessKey)
    (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))

/-- A variable command queues its write (`Laws.Step.Phases.queueWrite`). -/
theorem queueWrite_wellFormed {state : State} (formed : Laws.State.WellFormed state) (scope : ScopeOccurrenceId)
    (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.WellFormed (state.signal (.write scope writes rule)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))

/-- A variable command queues its removal (`Laws.Step.Phases.queueRemove`). -/
theorem queueRemove_wellFormed {state : State} (formed : Laws.State.WellFormed state) (scope : ScopeOccurrenceId)
    (names : List String) : Laws.State.WellFormed (state.signal (.remove scope names)) :=
  Laws.State.signal_wellFormed formed (Laws.State.signal_queueSound formed (fun _ _ _ same => by simp at same)
    (fun _ same => by simp at same) (fun _ _ _ same => by simp at same) (fun _ _ same => by simp at same))

/-- Data's share of the state invariant, measured at P0 (P2's budget rests on it): the registered write and removal
hooks keep `Laws.State.WellFormed`. -/
theorem registeredWrites_wellFormed {ctx : Ctx} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {rule : WriteRule} {state after : State} (formed : Laws.State.WellFormed state)
    (stands : Laws.Step.ScopeStands state scope)
    (ran : Registry.hooks.writeOutputs ctx scope writes rule state = .ok after) : Laws.State.WellFormed after :=
  (registered_writeOutputs Proofs.State.operations Proofs.State.stateFacts _ _ _ _ _ _ formed stands ran).1

theorem registeredRemovals_wellFormed {ctx : Ctx} {scope : ScopeOccurrenceId} {names : List String} {state after : State}
    (formed : Laws.State.WellFormed state) (stands : Laws.Step.ScopeStands state scope)
    (ran : Registry.hooks.removeVariables ctx scope names state = .ok after) : Laws.State.WellFormed after :=
  registered_removeVariables Proofs.State.operations Proofs.State.stateFacts _ _ _ _ _ formed stands ran

end Kernel.Proofs.Step
