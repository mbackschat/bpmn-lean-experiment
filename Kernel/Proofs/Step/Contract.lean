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
Multi-Instance's and Compensation's (`FeatureOps`) when the Multi-Instance and compensation hooks keep it by its own
proof (`MultiInstanceKeeps`, `CompensationKeeps`, `registered_contract_of`). `Kernel.Proofs.Step` fills
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
  have slots := Laws.Data.writeOutputs_induction (fun s => s.slots = state.slots)
    (fun s _ _ _ same => (Laws.State.setVariable_same s _ _ _).slots.trans same) (Eq.refl _) ran
  exact ⟨kept, scopes, fun occurrence member _ => occurrences ▸ member, fun item member => Laws.State.items_same member items,
    fun entry member => by rwa [slots] at member⟩

/-- `HookContract.removeVariables` of the registered hooks. -/
theorem registered_removeVariables (ops : Operations inv) (facts : StateFacts) :
    ∀ ctx scope names state after, inv ctx.program state → ScopeStands state scope →
      Registry.hooks.removeVariables ctx scope names state = .ok after → inv ctx.program after := by
  intro ctx scope names state after holds _ ran
  rw [Laws.Registry.hooks_removeVariables] at ran
  exact Laws.Data.removeVariables_keeps (dataOps ops facts ctx.program) holds ran

/-- Disarming a host keeps the completion pipeline's frame and leaves nothing attached to the host. -/
theorem disarm_frame (state : State) (host : OccurrenceId) : Laws.Step.PipelineFrame state (state.disarm host) ∧
    ∀ item ∈ itemList (state.disarm host).openItems, item.attachedTo ≠ some host := by
  rw [Laws.State.disarm_eq]
  refine ⟨⟨rfl, fun found member begun => ?_,
      fun item member => (Laws.State.mem_itemList_filter_val.mp (member)).1,
      fun _ kept => kept⟩,
    fun item member => by simpa using (Laws.State.mem_itemList_filter_val.mp (member)).2⟩
  exact List.mem_filter.mpr ⟨member, by simp [begun]⟩

/-- The host facts an arming's premises give, as Subscriptions states them. -/
theorem hosted_of {state : State} {host : OccurrenceId} {scope : ScopeOccurrenceId} (stands : Laws.Step.OccurrenceStands state host)
    (placed : Laws.Step.ScopeStands state scope)
    (hosted : ∀ occurrence ∈ state.occurrences, occurrence.id = host → occurrence.begun = true ∧ occurrence.scope = scope) :
    Laws.Subscriptions.Hosted scope (some host) state := by
  obtain ⟨occurrence, member, named⟩ := stands
  refine ⟨placed, fun id same => ?_⟩
  cases same
  exact ⟨occurrence, member, named, hosted occurrence member named⟩

/-- A completion's retained record keeps the completion pipeline's frame. -/
theorem retained_frame {state after : State} (scopes : after.scopes = state.scopes)
    (occurrences : after.occurrences = state.occurrences) (items : after.openItems = state.openItems)
    (instances : after.slots.instances = state.slots.instances) : Laws.Step.PipelineFrame state after :=
  ⟨scopes, fun _ member _ => occurrences ▸ member, fun _ member => Laws.State.items_same member items,
    fun _ member => instances ▸ member⟩

/-- `HookContract.delivered` of the registered hooks: the item a delivery fires is open. -/
theorem registered_delivered : ∀ ctx data state item fired,
    Registry.hooks.delivered ctx data state = .ok (item, fired) → item ∈ itemList state.openItems := by
  intro _ _ _ _ _ ran
  rw [Laws.Registry.hooks_delivered] at ran
  rcases Laws.Subscriptions.delivered_found ran with found | found
  · exact Laws.Hooks.item?_mem found
  · exact Laws.Hooks.item?_mem found

/-- `HookContract.startsFired` of the registered hooks: the starts a start input fires are root-process start Events
(`Laws.Starts.startsFired_root`). -/
theorem registered_startsFired : ∀ ctx input fired, Registry.hooks.startsFired ctx input = .ok fired →
    ∀ id ∈ fired, ∃ element ∈ ctx.program.children none, element.header.id = id := by
  intro _ _ _ ran id inside
  rw [Laws.Registry.hooks_startsFired] at ran
  obtain ⟨element, member, found⟩ := Laws.Starts.startsFired_root ran id inside
  obtain ⟨_, _, typed, named⟩ := found
  exact ⟨element, member, (Laws.Step.start?_bare typed).1 ▸ named⟩

/-- The operations records of every feature the registered hooks run but Multi-Instance's and Compensation's, of one
invariant. -/
structure FeatureOps (inv : Program → State → Prop) : Prop where
  operations : Laws.Step.Operations inv
  /-- The issuer is fresh (DC12): a subscription's reservation takes the next issue, which the table does not hold. -/
  issuer : ∀ program s, inv program s → Laws.State.IssuerFresh s
  work : ∀ program, Laws.Work.WorkOps program (inv program)
  flow : ∀ program, Laws.Flow.FlowOps program (inv program)
  join : ∀ program, Laws.Flow.JoinOps program (inv program) Laws.State.Settled
  starts : ∀ program, Laws.Starts.StartsOps (inv program)
  scopes : ∀ program, Laws.Scopes.ScopesOps program (inv program)
  subscriptions : ∀ program, Laws.Subscriptions.SubscriptionsOps program (inv program)
  propagation : ∀ program, Laws.Propagation.PropagationOps program (inv program)

/-- The operations records of every feature the registered hooks run, of one invariant. -/
structure RegisteredOps (inv : Program → State → Prop) : Prop extends FeatureOps inv where
  multiInstance : ∀ program, Laws.MultiInstance.MultiInstanceOps program (inv program) Laws.State.Settled
  compensation : ∀ program, Laws.Compensation.CompensationOps program (inv program)
  runs : ∀ program, Laws.Compensation.RunsOps program (inv program) Laws.State.Settled

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
  arrive _ _ _ _ _ _ _ holds member begun _ named _ _ _ ran :=
    Proofs.MultiInstance.arriveMultiInstance_keeps (ops _) holds member begun named ran
  completeBody _ _ _ _ _ _ _ holds _ ran := MultiInstance.completeBody_keeps (ops _) holds ran
  instanceCompleted _ _ _ _ _ _ holds stands ran := Proofs.MultiInstance.instanceCompleted_keeps (ops _) holds stands ran

/-- What the registered compensation hooks keep of `inv`, under what `Laws.Step.HookContract` gives each, and what the
drop a raise's search takes keeps (`Laws.Propagation.SearchHooks.dropRuns`): an invariant that reads the compensation
runs proves them of the hooks directly, since storing arbitrary runs need not keep it (`Proofs.Frame.StoresAlongside`).
A compensation is taken off a queue that kept `inv` (`Laws.State.Popped`). -/
structure CompensationKeeps (inv : Program → State → Prop) : Prop where
  completed : ∀ ctx occurrence state after, inv ctx.program state → occurrence ∈ state.occurrences →
    Feature.Compensation.completed ctx occurrence state = .ok after → inv ctx.program after ∧ PipelineFrame state after
  dropWithin : ∀ ctx scope state, inv ctx.program state →
    inv ctx.program (Feature.Compensation.dropWithin ctx scope state) ∧
      Laws.State.Steady state (Feature.Compensation.dropWithin ctx scope state)
  failCompensation : ∀ ctx handler code message origin state after, inv ctx.program state → ScopeStands state handler →
    Feature.Compensation.failCompensation ctx handler code message origin state = .ok after → inv ctx.program after
  compensate : ∀ ctx scope activity trigger leave resume state after, inv ctx.program state → ScopeStands state scope →
    (∀ next, resume = some next → Laws.State.Resumable state scope next) →
    (∀ element at_ resumed, resume = some (.occur element at_ resumed) → Laws.Step.PendingIn (inv ctx.program) element) →
    Laws.State.Popped (inv ctx.program) (.compensate scope activity trigger leave resume) state →
    Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after → inv ctx.program after
  handlerCompleted : ∀ ctx occurrence state after, inv ctx.program state → ScopeStands state occurrence.scope →
    Feature.Compensation.handlerCompleted ctx occurrence state = .ok after → inv ctx.program after
  handlerEnded : ∀ ctx occurrence state after, inv ctx.program state → ScopeStands state occurrence.scope →
    Feature.Compensation.handlerEnded ctx occurrence state = .ok after → inv ctx.program after

/-- `Hooks.completed` keeps `inv`, the scope occurrences, the occurrences and the open items: what it retains comes
from the occurrence's owned scope occurrence and from its own record, linked to the target `placement` gives. -/
theorem completed_keeps {inv : State → Prop} {ctx : Ctx} (ops : Laws.Compensation.CompensationOps ctx.program inv)
    {occurrence : Occurrence} {state after : State} (holds : inv state) (member : occurrence ∈ state.occurrences)
    (ran : Feature.Compensation.completed ctx occurrence state = .ok after) :
    inv after ∧ after.scopes = state.scopes ∧ after.occurrences = state.occurrences ∧ after.openItems = state.openItems ∧
      after.slots.instances = state.slots.instances := by
  rcases Laws.Compensation.completed_spec ran with ⟨-, rfl⟩ | ⟨handler, target, inner, retained⟩
  · exact ⟨holds, rfl, rfl, rfl, rfl⟩
  obtain ⟨outer, placed, perm, retained⟩ := retained
  obtain ⟨inside, -, retained⟩ := retained
  have linked : Laws.Compensation.InstanceLinked ctx.program state occurrence.scope target := by
    rcases (Laws.Compensation.placement_from placed).1 with same | ⟨entry, found, link, rest⟩
    · exact same ▸ .refl _
    have named : entry.id = occurrence.scope := by simpa using List.find?_some found
    exact named ▸ .parent entry target (List.mem_of_find?_eq_some found) link (.inr (.inl ⟨_, rest.1, rest.2⟩))
  have moved : ∀ record ∈ inner, Laws.Compensation.RecordHeld ctx.program state
      (Laws.Compensation.recordElements record) target := fun record held => by
    obtain ⟨owned, found, named⟩ := inside record held
    obtain ⟨present, owns, scope⟩ := Laws.Compensation.ownedScope_spec owned found
    exact ⟨record, record.scope, .inl ⟨perm.subset (List.mem_append_left _ held), rfl⟩, named ▸
      (Laws.Compensation.InstanceLinked.owner owned occurrence present member owns (.inr (.inr ⟨occurrence, member, owns,
        scope⟩))).trans linked, fun _ => id⟩
  have kept : ∀ record ∈ outer, Laws.Compensation.RecordFrom ctx.program state record record.scope := fun _ held =>
    .inl (.retained (perm.subset (List.mem_append_right _ held)))
  have runs : ∀ run ∈ state.slots.compensation.runs, (∀ record ∈ run.pending,
      Laws.Compensation.RecordFrom ctx.program state record run.scope) ∧ ∀ resume, run.resume = some resume →
        (∃ held ∈ state.slots.compensation.runs, held.resume = some resume) ∨
          (∃ context, resume = .group context) ∨ False := fun run held =>
    ⟨fun _ pending => .inl (.pending held pending), fun _ same => .inl ⟨run, held, same⟩⟩
  rcases retained with ⟨-, rfl⟩ | ⟨record, kept', rest⟩
  · rw [Laws.Compensation.store_eq]
    refine ⟨ops.store _ _ holds (fun _ member => member) ⟨fun record held => ?_, runs⟩, rfl, rfl, rfl, rfl⟩
    rcases List.mem_append.mp held with old | new
    · exact kept record old
    obtain ⟨original, inner', rfl⟩ := List.mem_map.mp new
    exact .inl (.narrow (moved original inner') (fun _ listed => by
      rw [Laws.Compensation.recordElements_scope] at listed; exact listed) (.refl _))
  obtain ⟨subject, placedAt, -, rest⟩ := rest
  obtain ⟨children, rfl⟩ := rest
  obtain ⟨scopes, occurrences, items, slots⟩ := ops.issued state
  have stored : Laws.Compensation.StoredFrom ctx.program state (fun _ => False)
      { state.slots.compensation with retained := outer ++ [record] } := by
    refine ⟨fun other held => ?_, runs⟩
    rcases List.mem_append.mp held with old | new
    · exact kept other old
    rw [List.mem_singleton.mp new, placedAt]
    refine .inr ⟨occurrence, member, subject, linked, fun chosen named => ?_, fun child inside => ?_⟩
    · obtain ⟨element, envelope, found, rest⟩ := (Laws.Compensation.placement_from placed).2 chosen (kept'.2.2 ▸ named)
      exact ⟨element, Laws.IL.element?_mem found, subject ▸ Laws.IL.element?_header found, envelope, rest⟩
    · obtain ⟨source, held, kept⟩ := List.mem_flatMap.mp (children ▸ inside)
      exact .narrow (moved source held) (fun _ named => by
        rw [← Laws.Compensation.keptRecords_elements]; exact List.mem_flatMap.mpr ⟨child, kept, named⟩) (.refl _)
  rw [Laws.Compensation.store_eq]
  exact ⟨ops.store _ _ (ops.takeCompletion state holds) (fun _ member => slots ▸ member)
      (stored.congr scopes occurrences (congrArg (·.compensation) slots)), scopes, occurrences, items,
    show state.takeCompletion.1.slots.instances = _ by rw [slots]⟩

/-- Dropping the runs inside a scope occurrence an interrupting catcher decided on (`Feature.Compensation.dropWithin`)
keeps `inv` and changes only the compensation slot. -/
theorem dropWithin_keeps {inv : State → Prop} {program : Program} (ops : Laws.Compensation.CompensationOps program inv)
    (ctx : Ctx) (scope : ScopeOccurrenceId)
    {state : State} (holds : inv state) : inv (Feature.Compensation.dropWithin ctx scope state) ∧
      ∃ compensation, Feature.Compensation.dropWithin ctx scope state = { state with slots := { state.slots with compensation } } :=
  by rw [Laws.Compensation.dropWithin_spec, Laws.Compensation.store_eq]
     exact ⟨ops.store _ _ holds (fun _ member => (List.mem_filter.mp member).1) (.held (fun _ member => member)
       fun run member => ⟨run, (List.mem_filter.mp member).1, rfl, rfl, fun _ => id⟩), _, rfl⟩

/-- `Hooks.handlerCompleted` keeps `inv` for a handler whose context stands. -/
theorem handlerCompleted_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : Laws.Compensation.RunsOps program inv settled)
    {ctx : Ctx} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerCompleted ctx occurrence state = .ok after) : inv after :=
  ((Laws.Compensation.runs_keep ops ctx _).2.1 _ _ _ holds stands
    (Laws.Compensation.handlerCompleted_spec ctx occurrence state ▸ ran)).1

/-- Dropping the runs inside a scope occurrence changes only the compensation slot, keeping only runs it had: the
membership `Laws.Compensation.CompensationOps.store` is handed, read as an invariant of its own. -/
theorem dropWithin_steady {inv : State → Prop} {program : Program} (ops : Laws.Compensation.CompensationOps program inv)
    (ctx : Ctx)
    (scope : ScopeOccurrenceId) (state : State) :
    Laws.State.Steady state (Feature.Compensation.dropWithin ctx scope state) := by
  obtain ⟨kept, _, same⟩ := dropWithin_keeps
    (inv := fun t => ∀ run ∈ t.slots.compensation.runs, run ∈ state.slots.compensation.runs) (program := program)
    { store := fun _ _ kept within _ run inside => kept run (within run inside)
      takeCompletion := fun t kept => by rw [(ops.issued t).2.2.2]; exact kept
      issued := ops.issued
      fail := fun t _ kept => by rw [Laws.State.signal_eq]; exact kept } ctx scope (state := state) (fun _ => id)
  rw [same] at kept ⊢
  exact ⟨rfl, rfl, .refl _, rfl, fun _ queued => queued, Laws.State.instanceOf_congr rfl rfl, rfl, kept,
    ⟨[], by simp [Laws.State.allSignals], by simp⟩, .of_eq rfl⟩

/-- `Hooks.failCompensation` keeps `inv`. -/
theorem failCompensation_keeps {inv : State → Prop} {program : Program} (ops : Laws.Compensation.CompensationOps program inv)
    {ctx : Ctx} {handler : ScopeOccurrenceId}
    {code : String} {message : Option String} {origin : Origin} {state after : State} (holds : inv state)
    (ran : Feature.Compensation.failCompensation ctx handler code message origin state = .ok after) : inv after := by
  obtain ⟨_, _, _, failed⟩ := Laws.Compensation.failCompensation_spec ran
  obtain ⟨_, -, -, failed⟩ := failed
  obtain ⟨-, -, rfl⟩ := failed
  exact ops.fail _ _ holds

/-- `Hooks.handlerEnded` keeps `inv` for a handler whose context stands. -/
theorem handlerEnded_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {program : Program}
    (ops : Laws.Compensation.RunsOps program inv settled)
    {ctx : Ctx} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerEnded ctx occurrence state = .ok after) : inv after := by
  rcases Laws.Compensation.handlerEnded_spec ran with ⟨-, -, released⟩ | ⟨-, rfl⟩
  · exact handlerCompleted_keeps ops holds stands
      ((Laws.Compensation.handlerCompleted_spec ctx occurrence state).trans released)
  · exact holds

/-- `Hooks.compensate` keeps `inv` in a scope occurrence that stands, for a run that may end as it asks: the records it
takes lie in scope occurrences the throw sees, all of its process instance (`Laws.Compensation.visibleScopes_linked`). -/
theorem compensate_keeps {inv : State → Prop} {settled : State → OccurrenceId → Prop} {ctx : Ctx}
    (ops : Laws.Compensation.RunsOps ctx.program inv settled) {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {state after : State} (holds : inv state)
    (stands : scope ∈ state.scopes.map (·.id))
    (resumable : ∀ next, resume = some next → (∀ occurrence leave, next = .complete occurrence leave →
      settled state occurrence) ∧ ∀ context, next = .group context → context = scope)
    (pending : ∀ element at_ resumed, resume = some (.occur element at_ resumed) → Laws.Step.PendingIn inv element)
    (queued : ∀ next, resume = some next → Laws.Compensation.ResumeQueued inv state next)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) : inv after := by
  obtain ⟨taken, others, takes, rest⟩ := Laws.Compensation.compensate_spec ran
  refine ((Laws.Compensation.runs_keep ops ctx _).1 _ _ _ _ ?_ ?_ rest.2).1 <;> rw [Laws.Compensation.store_eq]
  rotate_left
  · exact stands
  apply And.left
  refine ops.store state _ holds (fun run member => ?_) (fun run member context running => ?_)
    (Laws.Compensation.appended_resumes holds (fun _ old => old) pending) (.append (.held
      (fun record kept => ((takes.2 record).mp kept).1) fun run member => ⟨run, member, rfl, rfl, fun _ => id⟩)
      (fun record selected => ?_) fun next same => .inr (queued next same))
  · rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      refine .inr ⟨fun occurrence leave same => (resumable _ same).1 occurrence leave rfl,
        fun context same => (resumable _ same).2 context rfl, fun _ running => ?_⟩
      simp at running
  · rcases List.mem_append.mp member with old | new
    · exact .inl ⟨run, old, running⟩
    · rw [List.mem_singleton.mp new] at running
      simp at running
  · obtain ⟨retained, covered, -⟩ := (takes.1 record).mp selected
    exact .inl ⟨record, record.scope, .inl ⟨retained, rfl⟩, Laws.Compensation.visibleScopes_linked covered,
      fun _ => id⟩

/-- The registered compensation hooks keep an invariant their feature records are filled for. -/
theorem compensationKeeps_of (compensation : ∀ program, Laws.Compensation.CompensationOps program (inv program))
    (runs : ∀ program, Laws.Compensation.RunsOps program (inv program) Laws.State.Settled) : CompensationKeeps inv where
  completed _ _ _ _ holds member ran := by
    obtain ⟨kept, scopes, occurrences, rest⟩ := completed_keeps (compensation _) holds member ran
    obtain ⟨items, instances⟩ := rest
    exact ⟨kept, retained_frame scopes occurrences items instances⟩
  dropWithin ctx scope _ holds :=
    ⟨(dropWithin_keeps (compensation _) ctx scope holds).1, dropWithin_steady (compensation ctx.program) ctx scope _⟩
  failCompensation _ _ _ _ _ _ _ holds _ ran := failCompensation_keeps (compensation _) holds ran
  compensate _ _ _ _ _ _ _ _ holds stands resumable pending popped ran := by
    obtain ⟨entry, inside, named⟩ := stands
    refine compensate_keeps (runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) resumable pending
      (fun next same => ?_) ran
    obtain ⟨queue, _, kept, rest₁⟩ := popped
    obtain ⟨found, same'⟩ := rest₁
    refine ⟨queue, kept, by rw [same']; exact .of_same rfl rfl (.of_eq rfl), ?_, by rw [same'], by rw [same']⟩
    exact Laws.Step.mem_resumesOf.mpr ⟨_, _, _, _, same ▸ Laws.State.mem_allSignals_of found⟩
  handlerCompleted _ _ _ _ holds stands ran := by
    obtain ⟨entry, inside, named⟩ := stands
    exact handlerCompleted_keeps (runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  handlerEnded _ _ _ _ holds stands ran := by
    obtain ⟨entry, inside, named⟩ := stands
    exact handlerEnded_keeps (runs _) holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran

/-- An Error-path completion carries no trigger. -/
theorem untriggered_complete (id : OccurrenceId) (leave : Leave) (writes : List (String × Value)) (rule : WriteRule) :
    Laws.State.Untriggered (.complete id leave writes rule) :=
  ⟨fun _ _ _ _ _ => nofun, fun _ _ => nofun⟩

/-- What a variable write changes, it changes alone, so a raise's search reads the same. -/
theorem steady_of_same {before after : State} (same : Laws.State.SameButVariables before after) :
    Laws.State.Steady before after :=
  ⟨same.occurrences, same.scopes,
    .of_same (congrArg (List.map ScopeOccurrence.id) same.scopes) same.scopeOrdinals same.occurrenceOrdinals
      (.of_eq same.issued),
    same.scopeOrdinals, fun _ named => by
    unfold Laws.State.Queued at named ⊢
    rwa [same.signals, same.tokens] at named, same.instances, same.activations, fun _ inside => same.slots ▸ inside,
    ⟨[], by simp [same.signals], by simp⟩, .of_eq same.issued⟩

/-- The hooks the registered raise's search takes keep `inv` and what the search reads
(`Laws.Propagation.SearchHooks`): Data's writes change only variables, Work's Error-path leave then completes its
settled host, and Compensation's drop keeps what `CompensationKeeps.dropWithin` says. -/
theorem registeredSearch (ops : FeatureOps inv) (compensation : CompensationKeeps inv) (facts : Laws.Step.StateFacts)
    (ctx : Ctx)
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
      inv ctx.program after ∧ Laws.State.Steady state after ∧ after.slots.instances = state.slots.instances :=
    fun _ _ state _ holds ran =>
    ⟨(Laws.Data.writeOutputs_keeps (dataOps ops.operations facts ctx.program) holds (fun same => by cases same) ran).1,
      Laws.Data.writeOutputs_induction (Laws.State.Steady state)
        (fun _ _ _ _ steady => steady.trans (steady_of_same (Laws.State.setVariable_same _ _ _ _))) (.refl _) ran,
      Laws.Data.writeOutputs_induction (fun t => t.slots.instances = state.slots.instances)
        (fun s target name value same =>
          (congrArg (·.instances) (Laws.State.setVariable_same s target name value).slots).trans same) rfl ran⟩
  { mappedErrorOutputs := fun origin _ state _ holds settled ran => by
      rw [mapped] at ran
      refine Laws.Work.mappedErrorOutputs_keeps (motive := fun s => inv ctx.program s ∧ Laws.State.Steady state s ∧
          s.slots.instances = state.slots.instances)
        (fun _ _ _ _ ⟨kept, steady, instances⟩ wrote => ?_) (fun _ host named ⟨kept, steady, instances⟩ => ?_)
        ⟨holds, .refl _, rfl⟩ ran
      · obtain ⟨written, more, moreInstances⟩ := outward _ _ _ _ kept wrote
        exact ⟨written, steady.trans more, moreInstances.trans instances⟩
      · refine ⟨(ops.join _).complete _ _ _ _ _ kept ((settled.steady steady) host named)
          (fun _ same => by cases same), steady.trans ?_, by rw [Laws.State.signal_eq]; exact instances⟩
        rw [Laws.State.signal_eq]
        exact ⟨rfl, rfl, .refl _, rfl, fun request named => named.elim (fun named =>
          .inl ((List.mem_append.mp (Laws.State.allSignals_append _ _ ▸ named)).resolve_right (by simp))) .inr,
          Laws.State.instanceOf_congr rfl rfl, rfl, fun _ => id, ⟨[_], Laws.State.allSignals_append _ _,
          fun signal inside => List.mem_singleton.mp inside ▸ untriggered_complete _ _ _ _⟩, .of_eq rfl⟩
    writeCaught := fun _ _ _ _ holds ran => outward _ _ _ _ holds (caught _ _ _ ▸ ran)
    callOutputs := fun _ _ _ holds ran => by
      rw [call] at ran
      obtain ⟨⟨scope, writes⟩, _, ran⟩ := Laws.Step.bind_ok ran
      exact outward _ _ _ _ holds ran
    dropRuns := fun scope _ holds => by
      rw [drop]
      exact ⟨(compensation.dropWithin ctx scope _ holds).1, (compensation.dropWithin ctx scope _ holds).2,
        by rw [Laws.Compensation.dropWithin_spec, Laws.Compensation.store_eq]⟩ }

/-- `Hooks.raise` keeps `inv` for a raise whose host is settled and whose origin, an Event's, names begun occurrences,
taken off a queue that kept `inv`. -/
theorem raise_keeps {inv : State → Prop} {ctx : Ctx} {hooks : Feature.Propagation.PropagationHooks}
    (ops : Laws.Propagation.PropagationOps ctx.program inv) (search : Laws.Propagation.SearchHooks ctx inv hooks)
    {raised : Raised} {origin : Origin} {state after : State} (holds : inv state)
    (settled : Laws.Propagation.HostSettled origin state) (thrown : Laws.Propagation.Thrown ctx.program origin state)
    (popped : Laws.State.Popped inv (.raise raised origin) state)
    (ran : Feature.Propagation.raise hooks ctx raised origin state = .ok after) : inv after := by
  rcases Laws.Propagation.raise_spec ran with ⟨boundary, writes, left, rest⟩ | searched
  · obtain ⟨⟨-, inside⟩, leaves, rfl⟩ := rest
    obtain ⟨kept, steady, instances⟩ := search.mappedErrorOutputs _ _ _ _ holds settled leaves
    obtain ⟨queue, _, queued, rest₁⟩ := popped
    obtain ⟨heads, shape⟩ := rest₁
    have scopes : state.scopes = queue.scopes := by rw [shape]
    have entries : state.slots.instances = queue.slots.instances := by rw [shape]
    obtain ⟨linked, listed⟩ := Laws.Propagation.boundariesOf_sourced inside
    exact (Laws.Propagation.boundaryFire_keeps ops _ _ _ _ kept (Laws.Propagation.boundariesOf_boundaryOf inside)
      (Laws.Flow.Anchored.held queued
        ((show Laws.State.ScopeGrows queue state by rw [shape]; exact .of_same rfl rfl (.of_eq rfl)).trans steady.grows)
        (fun _ member => by rw [steady.scopes, scopes] at member; exact member)
        (fun _ member => by rw [instances, entries] at member; exact member) linked
        (.inr (.inr (.inr ⟨raised, origin, Laws.State.mem_allSignals_of heads, rfl, rfl⟩)))) listed).1
  · exact Laws.Propagation.searchScopes_keeps ops search popped _ _ _ _ _ holds settled thrown (.refl _) (.inl rfl)
      searched

/-- The registered hooks keep any invariant every feature's record but Multi-Instance's and Compensation's is filled
for and the Multi-Instance and compensation hooks keep. -/
theorem registered_contract_of {inv : Program → State → Prop} (ops : FeatureOps inv)
    (multiInstance : MultiInstanceKeeps inv) (compensation : CompensationKeeps inv) (facts : Laws.Step.StateFacts) :
    Laws.Step.HookContract Registry.hooks inv where
  arriveStart _ _ _ _ _ _ _ holds member begun ran := by
    rw [Laws.Registry.hooks_arriveStart] at ran
    exact Laws.Starts.arriveStart_keeps (ops.starts _) holds member begun ran
  arriveActivity _ _ _ _ _ _ holds member begun unstarted role unowned named activity ran := by
    rw [Laws.Registry.hooks_arriveActivity] at ran
    exact Laws.Work.arriveActivity_keeps (ops.work _) holds member begun unstarted role unowned named activity ran
  arriveMultiInstance _ _ _ _ _ _ _ holds member begun body named looped newest unrun ran := by
    rw [Laws.Registry.hooks_arriveMultiInstance] at ran
    exact multiInstance.arrive _ _ _ _ _ _ _ holds member begun body named looped newest unrun ran
  arriveScope _ _ _ _ _ _ _ holds member begun named ready ran := by
    rw [Laws.Registry.hooks_arriveScope] at ran
    exact Laws.Scopes.arriveScope_keeps (ops.scopes _) holds member begun named ready ran
  arriveGateway _ _ _ _ _ _ holds member begun named ran := by
    rw [Laws.Registry.hooks_arriveGateway] at ran
    exact Laws.Flow.arriveGateway_keeps (ops.join _) holds member begun named ran
  arriveCatch _ _ _ _ _ _ _ holds member begun unstarted role ran := by
    rw [Laws.Registry.hooks_arriveCatch] at ran
    exact Laws.Subscriptions.arriveCatch_keeps (ops.subscriptions _) holds member begun unstarted role ran
  arriveThrow _ _ _ _ _ _ _ holds member begun unstarted role named begunFrom ran := by
    rw [Laws.Registry.hooks_arriveThrow] at ran
    exact Laws.Propagation.arriveThrow_keeps (ops.propagation _) holds member begun unstarted role named begunFrom ran
  arriveLink _ _ _ _ _ _ holds member begun named ran := by
    rw [Laws.Registry.hooks_arriveLink] at ran
    exact Laws.Flow.arriveLink_keeps (ops.flow _) holds member begun named ran
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
  failJob _ _ _ _ _ _ _ _ ran := by
    simp [Laws.Registry.hooks_failJob] at ran
  triggerActivity _ _ _ _ _ _ _ holds member activity ran := by
    rw [Laws.Registry.hooks_triggerActivity] at ran
    exact Laws.Work.triggerActivity_keeps (ops.work _) holds member activity ran
  trigger _ _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_trigger] at ran
    exact Laws.Subscriptions.trigger_keeps (ops.subscriptions _) holds member ran
  arm _ _ _ _ _ _ holds stands placed hosted popped ran := by
    rw [Laws.Registry.hooks_arm] at ran
    exact Laws.Subscriptions.arm_keeps (ops.subscriptions _) (ops.issuer _) holds (hosted_of stands placed hosted) popped ran
  armScope _ _ _ _ holds placed ran := by
    rw [Laws.Registry.hooks_armScope] at ran
    exact Laws.Subscriptions.armScope_keeps (ops.subscriptions _) (ops.issuer _) holds placed ran
  armGateway _ _ _ _ _ _ holds stands placed hosted popped ran := by
    rw [Laws.Registry.hooks_armGateway] at ran
    exact Laws.Subscriptions.armGateway_keeps (ops.subscriptions _) (ops.issuer _) holds (hosted_of stands placed hosted) popped ran
  raise ctx _ _ _ _ holds raisable settled popped ran := by
    rw [Laws.Registry.hooks_raise] at ran
    exact raise_keeps (ops.propagation _) (registeredSearch ops compensation facts ctx (by simp only)
      (fun _ _ _ => by simp only) (fun _ _ _ => by simp only) (by simp only)) holds settled (fun event => (raisable event).2.2)
      popped ran
  compensate _ _ _ _ _ _ _ _ holds stands resumable pending popped ran := by
    rw [Laws.Registry.hooks_compensate] at ran
    exact compensation.compensate _ _ _ _ _ _ _ _ holds stands resumable pending popped ran
  failCompensation _ _ _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_failCompensation] at ran
    exact compensation.failCompensation _ _ _ _ _ _ _ holds stands ran
  leave _ occurrence state _ holds _ ran := by
    rw [Laws.Registry.hooks_leave] at ran
    obtain ⟨kept, disarmed⟩ := Laws.Subscriptions.leave_keeps (ops.subscriptions _) holds ran
    subst disarmed
    exact ⟨kept, disarm_frame state occurrence.id⟩
  writeOutputs := registered_writeOutputs ops.operations facts
  removeVariables := registered_removeVariables ops.operations facts
  completed _ _ _ _ holds member ran := by
    rw [Laws.Registry.hooks_completed] at ran
    exact compensation.completed _ _ _ _ holds member ran
  outflow _ _ _ _ _ holds stands continues ran := by
    rw [Laws.Registry.hooks_outflow] at ran
    exact Laws.Flow.outflow_keeps (ops.flow _) holds stands continues ran
  instanceCompleted _ _ _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_instanceCompleted] at ran
    obtain ⟨entry, inside, named⟩ := stands
    exact multiInstance.instanceCompleted _ _ _ _ _ _ holds (List.mem_map.mpr ⟨entry, inside, named⟩) ran
  handlerCompleted _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerCompleted] at ran
    exact compensation.handlerCompleted _ _ _ _ holds stands ran
  handlerEnded _ _ _ _ holds stands ran := by
    rw [Laws.Registry.hooks_handlerEnded] at ran
    exact compensation.handlerEnded _ _ _ _ holds stands ran
  cancelled _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_cancelled] at ran
    cases ran
    exact holds
  written _ _ _ _ holds ran := by
    rw [Laws.Registry.hooks_written] at ran
    exact Laws.Subscriptions.offerWrites_keeps (ops.subscriptions _) holds ran
  delivered := registered_delivered
  select _ _ _ _ _ picked := by
    rw [Laws.Registry.hooks_select] at picked
    exact Laws.Flow.select_lists picked
  startsFired := registered_startsFired

/-- The registered hooks keep any invariant every feature's record is filled for. -/
theorem registered_contract {inv : Program → State → Prop} (ops : RegisteredOps inv) (facts : Laws.Step.StateFacts) :
    Laws.Step.HookContract Registry.hooks inv :=
  registered_contract_of ops.toFeatureOps (multiInstanceKeeps_of ops.multiInstance)
    (compensationKeeps_of ops.compensation ops.runs) facts

/-- The registered hooks' contract with an outflow's flows read off states that kept `src`, given Flow's record for it:
only the outflow reads them. -/
theorem registered_sourced {inv src : Program → State → Prop} (contract : Laws.Step.HookContract Registry.hooks inv)
    (flow : ∀ program, Laws.Flow.FlowOps program (inv program) (src program)) :
    Laws.Step.HookContract Registry.hooks inv src :=
  { contract with
    outflow := fun _ _ _ _ _ holds stands continues ran => by
      rw [Laws.Registry.hooks_outflow] at ran
      exact Laws.Flow.outflow_keeps (flow _) holds stands continues ran }

end Contract

end Kernel.Proofs.Step
