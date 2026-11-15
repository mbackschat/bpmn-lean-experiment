module

public import Kernel.Laws.Step.Keeps
public import Kernel.Laws.Registry
public import Kernel.Laws.Flow
public import Kernel.Laws.Scopes
public import Kernel.Laws.Starts
public import Kernel.Laws.Subscriptions
public import Kernel.Laws.Data
public import Kernel.Laws.Work
public import Kernel.Laws.Compensation
public import Kernel.Laws.Propagation
public import Kernel.Proofs.MultiInstance.Hooks

/-! # Proofs: the registered hooks' contract

The registered hooks keep any invariant every feature's operations record is filled for (`RegisteredOps`), one field
per hook from its feature's lemma, which is generic in the invariant (`registered_contract`), or every record but
Multi-Instance's (`FeatureOps`) when the Multi-Instance hooks keep it by its own proof (`MultiInstanceKeeps`,
`registered_contract_of`). `Kernel.Proofs.Step` fills
the records of `Laws.State.WellFormed`, and the cancellation lane those of properties carried beside it
(`Kernel.Proofs.Cancellation.Registered`), which `Kernel.Proofs.Step` then instantiates; the contract sits in a module
of its own so that both can import it. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Step

open Kernel

section Contract

open Kernel.Laws.Step (Operations StateFacts ScopeStands PipelineFrame)

variable {inv : Program → State → Prop}

/-- Data's operations record (`Laws.Data.StateOps`), from the root's. -/
theorem dataOps (ops : Operations inv) (facts : StateFacts) (program : Program) : Laws.Data.StateOps (inv program) where
  housed := ops.variablesHoused program
  rooted := ops.rootStands program
  set := ops.setVariable program
  remove := ops.removeVariable program
  setFrame := facts.setVariable
  removeFrame := facts.removeVariable
  declaring := facts.declaring
  owner := facts.owner
  instanceRoot := facts.instanceRoot

/-- `HookContract.writeOutputs` of the registered hooks. -/
theorem registered_writeOutputs (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope writes rule state after, inv ctx.program state → ScopeStands state scope →
      Registry.hooks.writeOutputs ctx scope writes rule state = .ok after → inv ctx.program after ∧
        PipelineFrame state after := by
  intro ctx scope writes rule state after holds stands ran
  rw [Laws.Registry.hooks_writeOutputs] at ran
  obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Data.writeOutputs_keeps (dataOps ops facts ctx.program) holds (fun _ => stands)
    ran
  exact ⟨kept, scopes, fun occurrence member _ => occurrences ▸ member, fun item member => items ▸ member⟩

/-- `HookContract.removeVariables` of the registered hooks. -/
theorem registered_removeVariables (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope names state after, inv ctx.program state → ScopeStands state scope →
      Registry.hooks.removeVariables ctx scope names state = .ok after → inv ctx.program after := by
  intro ctx scope names state after holds _ ran
  rw [Laws.Registry.hooks_removeVariables] at ran
  exact Laws.Data.removeVariables_keeps (dataOps ops facts ctx.program) holds ran

/-- Disarming a host keeps the completion pipeline's frame and leaves nothing attached to the host. -/
theorem disarm_frame (state : State) (host : Nat) : Laws.Step.PipelineFrame state (state.disarm host) ∧
    ∀ item ∈ (state.disarm host).openItems, item.attachedTo ≠ some host := by
  rw [Laws.State.disarm_eq]
  refine ⟨⟨rfl, fun found member begun => ?_, fun item member => (List.mem_filter.mp member).1⟩,
    fun item member => by simpa using (List.mem_filter.mp member).2⟩
  exact List.mem_filter.mpr ⟨member, by simp [begun]⟩

/-- The host facts an arming's premises give, as Subscriptions states them. -/
theorem hosted_of {state : State} {host : Nat} {scope : ScopeOccurrenceId} (stands : Laws.Step.OccurrenceStands state host)
    (placed : Laws.Step.ScopeStands state scope)
    (hosted : ∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) :
    Laws.Subscriptions.Hosted scope (some host) state := by
  obtain ⟨occurrence, member, named⟩ := stands
  refine ⟨placed, fun id same => ?_⟩
  cases same
  exact ⟨occurrence, member, named, hosted occurrence member named⟩

/-- A completion's retained record keeps the completion pipeline's frame. -/
theorem retained_frame {state after : State} (scopes : after.scopes = state.scopes)
    (occurrences : after.occurrences = state.occurrences) (items : after.openItems = state.openItems) :
    Laws.Step.PipelineFrame state after :=
  ⟨scopes, fun _ member _ => occurrences ▸ member, fun _ member => items ▸ member⟩

/-- `HookContract.delivered` of the registered hooks: the item a delivery fires is open. -/
theorem registered_delivered : ∀ ctx data state item fired,
    Registry.hooks.delivered ctx data state = .ok (item, fired) → item ∈ state.openItems := by
  intro _ _ _ _ _ ran
  rw [Laws.Registry.hooks_delivered] at ran
  rcases Laws.Subscriptions.delivered_found ran with found | found
  · exact Laws.Hooks.item?_mem found
  · exact Laws.Hooks.item?_mem found

/-- The operations records of every feature the registered hooks run but Multi-Instance's, of one invariant. -/
structure FeatureOps (inv : Program → State → Prop) : Prop where
  operations : Laws.Step.Operations inv
  work : ∀ program, Laws.Work.WorkOps program (inv program)
  flow : ∀ program, Laws.Flow.FlowOps (inv program)
  join : ∀ program, Laws.Flow.JoinOps (inv program) Laws.State.Settled
  starts : ∀ program, Laws.Starts.StartsOps (inv program)
  scopes : ∀ program, Laws.Scopes.ScopesOps (inv program)
  subscriptions : ∀ program, Laws.Subscriptions.SubscriptionsOps program (inv program)
  compensation : ∀ program, Laws.Compensation.CompensationOps (inv program)
  propagation : ∀ program, Laws.Propagation.PropagationOps program (inv program)
  runs : ∀ program, Laws.Compensation.RunsOps (inv program) Laws.State.Settled

/-- The operations records of every feature the registered hooks run, of one invariant. -/
structure RegisteredOps (inv : Program → State → Prop) : Prop extends FeatureOps inv where
  multiInstance : ∀ program, Laws.MultiInstance.MultiInstanceOps program (inv program) Laws.State.Settled

/-- What the registered Multi-Instance hooks keep of `inv`, under what `Laws.Step.HookContract` gives each: an invariant
whose feature record is not filled, since it reads what a body's slot record is set to, proves them of the hooks
directly. -/
structure MultiInstanceKeeps (inv : Program → State → Prop) : Prop where
  arrive : ∀ ctx header envelope loop occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    occurrence.begun = true → occurrence.role = .multiInstanceBody → header.id = occurrence.element →
    ((ctx.program.element? header.id).bind (·.envelope?)).bind (·.multiInstance) = some loop →
    state.draft.started.getLast?.map (·.occurrence) = some (Laws.State.key state occurrence) →
    (∀ run ∈ state.slots.multiInstances, run.occurrence ≠ occurrence.id) →
    Feature.MultiInstance.arriveMultiInstance ctx header envelope loop occurrence state = .ok after →
    inv ctx.program after
  completeBody : ∀ ctx header envelope loop occurrence state after, inv ctx.program state →
    occurrence ∈ state.occurrences →
    Feature.MultiInstance.completeBody ctx header envelope loop occurrence state = .ok after → inv ctx.program after
  instanceCompleted : ∀ ctx body occurrence writes state after, inv ctx.program state →
    occurrence.scope ∈ Laws.State.scopeIds state →
    Feature.MultiInstance.instanceCompleted ctx body occurrence writes state = .ok after → inv ctx.program after

/-- The registered Multi-Instance hooks keep an invariant their feature record is filled for. -/
theorem multiInstanceKeeps_of
    (ops : ∀ program, Laws.MultiInstance.MultiInstanceOps program (inv program) Laws.State.Settled) :
    MultiInstanceKeeps inv where
  arrive _ _ _ _ _ _ _ holds member begun _ _ _ _ _ ran :=
    Proofs.MultiInstance.arriveMultiInstance_keeps (ops _) holds member begun ran
  completeBody _ _ _ _ _ _ _ holds _ ran := Laws.MultiInstance.completeBody_keeps (ops _) holds ran
  instanceCompleted _ _ _ _ _ _ holds stands ran := Proofs.MultiInstance.instanceCompleted_keeps (ops _) holds stands ran

/-- What a variable write changes, it changes alone, so a raise's search reads the same. -/
theorem steady_of_same {before after : State} (same : Laws.State.SameButVariables before after) :
    Laws.Propagation.Steady before after :=
  ⟨same.occurrences, same.scopes, Nat.le_of_eq same.nextIssue.symm, fun _ named => by
    unfold Laws.State.Queued at named ⊢
    rwa [same.signals, same.tokens] at named⟩

/-- The hooks the registered raise's search takes keep `inv` and what the search reads
(`Laws.Propagation.SearchHooks`): Data's writes change only variables, Work's Error-path leave then completes its
settled host, and Compensation's drop changes only the runs. -/
theorem registeredSearch (ops : FeatureOps inv) (facts : Laws.Step.StateFacts) (ctx : Ctx)
    {propagation : Feature.Propagation.PropagationHooks}
    (mapped : propagation.mappedErrorOutputs = Feature.Work.mappedErrorOutputs Feature.Data.writeOutputs)
    (caught : ∀ ctx scope writes,
      propagation.writeCaught ctx scope writes = Feature.Data.writeOutputs ctx scope writes .outward)
    (call : ∀ ctx root state, propagation.callOutputs ctx root state = do
      let (scope, writes) ← Feature.Work.Call.raisedOutputs ctx root state
      Feature.Data.writeOutputs ctx scope writes .outward state)
    (drop : propagation.dropRuns = Feature.Compensation.dropWithin) :
    Laws.Propagation.SearchHooks ctx (inv ctx.program) propagation :=
  have outward : ∀ scope writes state after, inv ctx.program state →
      Feature.Data.writeOutputs ctx scope writes .outward state = .ok after →
      inv ctx.program after ∧ Laws.Propagation.Steady state after := fun _ _ state _ holds ran =>
    ⟨(Laws.Data.writeOutputs_keeps (dataOps ops.operations facts ctx.program) holds (fun same => by cases same) ran).1,
      Laws.Data.writeOutputs_induction (Laws.Propagation.Steady state)
        (fun _ _ _ _ steady => steady.trans (steady_of_same (Laws.State.setVariable_same _ _ _ _))) (.refl _) ran⟩
  { mappedErrorOutputs := fun origin _ state _ holds settled ran => by
      rw [mapped] at ran
      refine Laws.Work.mappedErrorOutputs_keeps (motive := fun s => inv ctx.program s ∧ Laws.Propagation.Steady state s)
        (fun _ _ _ _ ⟨kept, steady⟩ wrote => ?_) (fun _ host named ⟨kept, steady⟩ => ?_) ⟨holds, .refl _⟩ ran
      · obtain ⟨written, more⟩ := outward _ _ _ _ kept wrote
        exact ⟨written, steady.trans more⟩
      · refine ⟨(ops.join _).complete _ _ _ _ _ kept ((settled.steady steady) host named), steady.trans ?_⟩
        rw [Laws.State.signal_eq]
        exact ⟨rfl, rfl, Nat.le_refl _, fun request named => named.elim (fun named =>
          .inl ((List.mem_append.mp named).resolve_right (by simp))) .inr⟩
    writeCaught := fun _ _ _ _ holds ran => outward _ _ _ _ holds (caught _ _ _ ▸ ran)
    callOutputs := fun _ _ _ holds ran => by
      rw [call] at ran
      obtain ⟨⟨scope, writes⟩, _, ran⟩ := Laws.Step.bind_ok ran
      exact outward _ _ _ _ holds ran
    dropRuns := fun scope _ holds => by
      rw [drop]
      obtain ⟨kept, _, same⟩ := Laws.Compensation.dropWithin_keeps (ops.compensation _) ctx scope holds
      refine ⟨kept, ?_⟩
      rw [same]
      exact ⟨rfl, rfl, Nat.le_refl _, fun _ queued => queued⟩ }

/-- The registered hooks keep any invariant every feature's record but Multi-Instance's is filled for and the
Multi-Instance hooks keep. -/
theorem registered_contract_of {inv : Program → State → Prop} (ops : FeatureOps inv)
    (multiInstance : MultiInstanceKeeps inv) (facts : Laws.Step.StateFacts) :
    Laws.Step.HookContract Registry.hooks inv where
  arriveStart _ _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveStart] at ran
    exact Laws.Starts.arriveStart_keeps (ops.starts _) holds member begun ran
  arriveActivity _ _ _ _ _ _ holds member begun unstarted role ran := by
    rw [Laws.Registry.hooks_arriveActivity] at ran
    exact Laws.Work.arriveActivity_keeps (ops.work _) holds member begun unstarted role ran
  arriveMultiInstance _ _ _ _ _ _ _ holds member begun body named looped newest unrun ran := by
    rw [Laws.Registry.hooks_arriveMultiInstance] at ran
    exact multiInstance.arrive _ _ _ _ _ _ _ holds member begun body named looped newest unrun ran
  arriveScope _ _ _ _ _ _ _ holds member begun ready ran := by
    rw [Laws.Registry.hooks_arriveScope] at ran
    exact Laws.Scopes.arriveScope_keeps (ops.scopes _) holds member begun ready ran
  arriveGateway _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveGateway] at ran
    exact Laws.Flow.arriveGateway_keeps (ops.join _) holds member begun ran
  arriveCatch _ _ _ _ _ _ _ holds member begun unstarted role ran := by
    rw [Laws.Registry.hooks_arriveCatch] at ran
    exact Laws.Subscriptions.arriveCatch_keeps (ops.subscriptions _) holds member begun unstarted role ran
  arriveThrow _ _ _ _ _ _ _ holds member begun unstarted role named ran := by
    rw [Laws.Registry.hooks_arriveThrow] at ran
    exact Laws.Propagation.arriveThrow_keeps (ops.propagation _) holds member begun unstarted role named ran
  arriveLink _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveLink] at ran
    exact Laws.Flow.arriveLink_keeps (ops.flow _) holds member begun ran
  completeScope _ _ _ _ _ _ _ holds member owned link ran := by
    rw [Laws.Registry.hooks_completeScope] at ran
    exact Laws.Scopes.completeScope_keeps (ops.scopes _) holds member owned link ran
  completeCall _ _ _ _ _ _ _ holds member owned link ran := by
    rw [Laws.Registry.hooks_completeCall] at ran
    exact Laws.Work.completeCall_keeps (ops.work _) holds member owned link ran
  completeBody _ _ _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_completeBody] at ran
    exact multiInstance.completeBody _ _ _ _ _ _ _ holds member ran
  completeUserTask _ _ _ _ _ _ _ holds member activity ran := by
    rw [Laws.Registry.hooks_completeUserTask] at ran
    exact Laws.Work.completeUserTask_keeps (ops.work _) holds member activity ran
  effectResult _ _ _ _ _ holds member effect ran := by
    rw [Laws.Registry.hooks_effectResult] at ran
    exact Laws.Work.effectResult_keeps (ops.work _) holds member effect ran
  retryIncident _ _ _ _ _ _ holds member incident ran := by
    rw [Laws.Registry.hooks_retryIncident] at ran
    exact Laws.Work.retryIncident_keeps (ops.work _) holds member incident ran
  cancelIncidentProcess _ _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelIncidentProcess] at ran
    exact Laws.Work.cancelIncidentProcess_keeps (ops.work _) holds ran
  triggerActivity _ _ _ _ _ _ _ holds member activity ran := by
    rw [Laws.Registry.hooks_triggerActivity] at ran
    exact Laws.Work.triggerActivity_keeps (ops.work _) holds member activity ran
  trigger _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_trigger] at ran
    exact Laws.Subscriptions.trigger_keeps (ops.subscriptions _) holds member ran
  arm _ _ _ _ _ _ holds stands placed hosted ran := by
    rw [Laws.Registry.hooks_arm] at ran
    exact Laws.Subscriptions.arm_keeps (ops.subscriptions _) holds (hosted_of stands placed hosted) ran
  armScope _ _ _ _ holds placed ran := by
    rw [Laws.Registry.hooks_armScope] at ran
    exact Laws.Subscriptions.armScope_keeps (ops.subscriptions _) holds placed ran
  armGateway _ _ _ _ _ _ holds stands placed hosted ran := by
    rw [Laws.Registry.hooks_armGateway] at ran
    exact Laws.Subscriptions.armGateway_keeps (ops.subscriptions _) holds (hosted_of stands placed hosted) ran
  raise ctx _ _ _ _ holds raisable settled ran := by
    rw [Laws.Registry.hooks_raise] at ran
    exact Laws.Propagation.raise_keeps (ops.propagation _) (registeredSearch ops facts ctx (by simp only)
      (fun _ _ _ => by simp only) (fun _ _ _ => by simp only) (by simp only)) holds settled (fun event => (raisable event).2.2)
      ran
  compensate _ _ _ _ _ _ _ _ holds stands resumable pending ran := by
    rw [Laws.Registry.hooks_compensate] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.compensate_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) resumable pending
      ran
  failCompensation _ _ _ _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_failCompensation] at ran
    exact Laws.Compensation.failCompensation_keeps (ops.compensation _) holds ran
  leave _ occurrence state _ holds _ ran := by
    rw [Laws.Registry.hooks_leave] at ran
    obtain ⟨kept, disarmed⟩ := Laws.Subscriptions.leave_keeps (ops.subscriptions _) holds ran
    subst disarmed
    exact ⟨kept, disarm_frame state occurrence.id⟩
  writeOutputs := registered_writeOutputs ops.operations facts
  removeVariables := registered_removeVariables ops.operations facts
  completed _ _ _ _ holds _ ran := by
    rw [Laws.Registry.hooks_completed] at ran
    obtain ⟨kept, scopes, occurrences, items⟩ := Laws.Compensation.completed_keeps (ops.compensation _) holds ran
    exact ⟨kept, retained_frame scopes occurrences items⟩
  outflow _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_outflow] at ran
    exact Laws.Flow.outflow_keeps (ops.flow _) holds stands ran
  instanceCompleted _ _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_instanceCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact multiInstance.instanceCompleted _ _ _ _ _ _ holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  handlerCompleted _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.handlerCompleted_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  handlerEnded _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerEnded] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact Laws.Compensation.handlerEnded_keeps (ops.runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  cancelled _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact holds
  written _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (ops.subscriptions _) holds ran
  delivered := registered_delivered

/-- The registered hooks keep any invariant every feature's record is filled for. -/
theorem registered_contract {inv : Program → State → Prop} (ops : RegisteredOps inv) (facts : Laws.Step.StateFacts) :
    Laws.Step.HookContract Registry.hooks inv :=
  registered_contract_of ops.toFeatureOps (multiInstanceKeeps_of ops.multiInstance) facts

end Contract

end Kernel.Proofs.Step
