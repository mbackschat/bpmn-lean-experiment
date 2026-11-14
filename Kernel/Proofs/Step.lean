module

public import Kernel.Laws.Step
public import Kernel.Laws.Registry
public import Kernel.Laws.Flow
public import Kernel.Laws.Data

/-! # Proofs: composition over the registered hooks

The proof wave's composition module ([PLAN, proof wave](../../docs/PLAN.md#proof-wave)): it instantiates the
`Step`-generic facts of `Kernel.Laws.Step` with the registered hooks of `Kernel.Laws.Registry` and the feature lemmas
of each `Kernel.Laws.<F>`, and opens no body. Each lane's statement is stated over a hooks parameter at the head of its
own `Kernel.Proofs.<Lane>` module and proved there from hook contracts; a lane closes when this module proves its
statement of `Registry.hooks`. Nothing executable imports this module.
-/

public section

namespace Kernel.Proofs.Step

open Kernel

/-- A flow token moved into an Exclusive Gateway leaves exactly the flows `Laws.Flow.ExclusiveTakes` allows (BPMN 2.0.2
§13.4.2, Table 13.2): the micro-step's body begins a fresh occurrence of the Gateway on that flow in the token's scope
occurrence and enqueues its completion, and nothing else, on the first candidate whose condition holds, else the default,
the conditions read in the state the occurrence began in. The premise that the Gateway's element carries no envelope
holds by `Element.envelope?`'s definition, which no proof may open; no admission rule is involved. -/
def ExclusiveArrival : Prop :=
  ∀ (ctx : Ctx) (flow : FlowId) (scope : ScopeOccurrenceId) (gateway : ElementId) (header : Header)
    (payload : GatewayPayload) (candidates : List FlowId) (default : Option FlowId) (state after : State),
    ctx.program.target? flow = some gateway →
    ctx.program.element? gateway = some (.gateway header payload) →
    (Element.gateway header payload).envelope? = none →
    payload.kind = .exclusive candidates default →
    Step.moveToken Registry.hooks ctx (.flow flow scope) state = .ok after →
    ∃ next sourceType begun occurrence taken evaluated,
      Step.arrive Registry.hooks ctx flow scope state = .ok next ∧
      state.beginOccurrence { element := gateway, scope, incoming := some flow }
        (Step.roleOf ctx.program { element := gateway, scope, incoming := some flow }) sourceType = (begun, occurrence) ∧
      occurrence.element = gateway ∧ occurrence.scope = scope ∧ occurrence.incoming = some flow ∧
      next = begun.signal (.complete occurrence.id (.flows taken) [] .outward) ∧
      Laws.Flow.ExclusiveTakes candidates default (Laws.Flow.candidateHolds ctx (begun.evalContext ctx.program scope))
        evaluated (some taken)

/-- The representative theorem of P0: `Step`'s token routing and dispatch (`Laws.Step`), the registered Gateway hook
(`Laws.Registry`) and Flow's Exclusive Gateway lemma (`Laws.Flow`), composed without opening a body. -/
theorem exclusiveArrival : ExclusiveArrival := by
  intro ctx flow scope gateway header payload candidates default state after target element unlooped kind ran
  obtain ⟨next, _, arrived, _⟩ := Laws.Step.microStep_ok (Laws.Step.moveToken_flow ran)
  obtain ⟨reached, reachedTarget, begun_⟩ := Laws.Step.arrive_ok arrived
  have same : reached = gateway := Option.some.inj (reachedTarget.symm.trans target)
  subst same
  obtain ⟨sourceType, begun, occurrence, ⟨_, made, dispatched⟩⟩ := Laws.Step.begin_ok begun_
  have fresh := Laws.State.beginOccurrence_fresh (state := state) (sourceType := sourceType)
    (role := Step.roleOf ctx.program { element := reached, scope, incoming := some flow })
    (request := { element := reached, scope, incoming := some flow }) (by simp)
  simp only [made] at fresh
  obtain ⟨isGateway, inScope, onFlow, _⟩ := fresh
  rw [Laws.Step.dispatch_gateway (isGateway ▸ element) unlooped, Laws.Registry.hooks_arriveGateway] at dispatched
  obtain ⟨taken, evaluated, signalled, takes⟩ := Laws.Flow.arriveGateway_exclusive kind dispatched
  rw [inScope] at takes
  exact ⟨next, sourceType, begun, occurrence, taken, evaluated, arrived, made, isGateway, inScope, onFlow, signalled,
    takes⟩

/-- Data's share of the state invariant, measured at P0 (P2's budget rests on it): the registered removal hook keeps
`Laws.State.WellFormed`, and the registered write hook keeps the variable sets keyed. -/
theorem registeredRemovals_wellFormed {ctx : Ctx} {scope : ScopeOccurrenceId} {names : List String} {state after : State}
    (formed : Laws.State.WellFormed state) (ran : Registry.hooks.removeVariables ctx scope names state = .ok after) :
    Laws.State.WellFormed after := by
  rw [Laws.Registry.hooks_removeVariables] at ran
  exact Laws.Data.removeVariables_wellFormed formed ran

theorem registeredWrites_variablesKeyed {ctx : Ctx} {scope : ScopeOccurrenceId} {writes : List (String × Value)}
    {rule : WriteRule} {state after : State} (keyed : Laws.State.VariablesKeyed state)
    (ran : Registry.hooks.writeOutputs ctx scope writes rule state = .ok after) : Laws.State.VariablesKeyed after := by
  rw [Laws.Registry.hooks_writeOutputs] at ran
  exact Laws.Data.writeOutputs_variablesKeyed keyed ran

end Kernel.Proofs.Step
