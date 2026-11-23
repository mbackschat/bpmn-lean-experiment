module

public import Kernel.Laws.Registry
public import Kernel.Proofs.Step
public import Kernel.Proofs.Compensation.Hooks
public import Kernel.Proofs.Compensation.Raise

/-! # Proofs: the Compensation and Transaction lane under the registered hooks

The compensation hooks keep `WellFormed` with the lane relation `Formed` beside it (`compensationKeeps_formed`), each
hook by what `Kernel.Proofs.Compensation.Hooks` proves of its result, so the registered hooks keep both through every
committed input, at a start and in a population run (`RegisteredFormed`, `registered_commits`). A trigger takes out
once (`registered_takesOutOnce`) and handlers start in order (`registered_handlersInOrder`), and both apply to every
compensation `Step` performs, each a `FreshCall` (`registered_dequeued`). The registered hooks register a raise
(`raiseRegistered`), so Cancel propagation and handler failure hold of them (`registered_cancelCompensatesFirst`,
`registered_handlerFailure`). This is the lane's one module that imports the registry's Laws module, since it composes
the registered hooks, and so stays in every feature's rebuild cone (guard 15). Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.Compensation

open Kernel
open Kernel.Laws.State (WellFormed)
open Kernel.Laws.Compensation (Advances ClaimsApart FirstOf Keyed Ready TakesOut)
open Kernel.Proofs.Cancellation (featureOps_frame multiInstanceOps_alongside)
open Kernel.Proofs.Frame (phases_alongside)

/-- The compensation hooks keep `WellFormed` with the lane relation beside it, read under `hooks`' Step context, given
that they keep `WellFormed`. -/
theorem compensationKeeps_formed (hooks : Hooks) (wf : Proofs.Step.CompensationKeeps WellFormed) :
    Proofs.Step.CompensationKeeps fun program s =>
      WellFormed program s ∧ Formed (DependsIn hooks footprintReads footprintWrites program) s where
  completed ctx occurrence state after holds member ran := by
    obtain ⟨kept, frame⟩ := wf.completed ctx occurrence state after holds.1 member ran
    exact ⟨⟨kept, completed_formed hooks holds.1 holds.2 member kept ran⟩, frame⟩
  dropWithin ctx scope state holds := by
    obtain ⟨kept, steady⟩ := wf.dropWithin ctx scope state holds.1
    exact ⟨⟨kept, dropWithin_formed hooks holds.1 holds.2 kept⟩, steady⟩
  failCompensation ctx handler code message origin state after holds stands ran := by
    have kept := wf.failCompensation ctx handler code message origin state after holds.1 stands ran
    exact ⟨kept, failCompensation_formed hooks holds.2 ran⟩
  compensate ctx scope activity trigger leave resume state after holds stands resumable pending popped ran := by
    have kept := wf.compensate ctx scope activity trigger leave resume state after holds.1 stands resumable
      (fun element at_ resumed named => by
        obtain ⟨held, heldHolds, waiting⟩ := pending element at_ resumed named
        exact ⟨held, heldHolds.1, waiting⟩)
      (by
        obtain ⟨queue, unit, queueHolds, rest⟩ := popped
        exact ⟨queue, unit, queueHolds.1, rest⟩) ran
    exact ⟨kept, compensate_formed hooks holds.1 holds.2 stands popped kept ran⟩
  handlerCompleted ctx occurrence state after holds stands ran := by
    have kept := wf.handlerCompleted ctx occurrence state after holds.1 stands ran
    exact ⟨kept, handlerCompleted_formed hooks holds.1 holds.2 stands kept ran⟩
  handlerEnded ctx occurrence state after holds stands ran := by
    have kept := wf.handlerEnded ctx occurrence state after holds.1 stands ran
    exact ⟨kept, handlerEnded_formed hooks holds.1 holds.2 stands kept ran⟩

/-- The registered compensation hooks keep `WellFormed` with the lane relation beside it. -/
theorem registered_compensationKeeps :
    Proofs.Step.CompensationKeeps fun program s =>
      WellFormed program s ∧ Formed (DependsIn Registry.hooks footprintReads footprintWrites program) s :=
  compensationKeeps_formed Registry.hooks
    (Proofs.Step.compensationKeeps_of Proofs.Step.registeredOps_wellFormed.compensation
      Proofs.Step.registeredOps_wellFormed.runs)

/-! ## A trigger's run and the runs a handler's end releases -/

/-- An advance whose first run of its key holds nothing pending or running and resumes no group drops the runs of the
key and changes no retained record. -/
theorem advance_ended {ctx : Ctx} {scope : ScopeOccurrenceId} {trigger : OccurrenceRef} {s t : State} {fuel : Nat}
    (idle : ∀ run, FirstOf (Keyed scope trigger) s.slots.compensation.runs run →
      run.pending = [] ∧ run.running = [] ∧ resumesGroup run.resume = false)
    (ran : Feature.Compensation.advance ctx scope trigger s fuel = .ok t) :
    t.slots.compensation.retained = s.slots.compensation.retained ∧
      t.slots.compensation.runs = s.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) := by
  obtain ⟨_, run, _, rest⟩ := Laws.Compensation.advance_spec ran
  obtain ⟨first, ended | progressed⟩ := rest
  · obtain ⟨_, _, dropped, rest⟩ := ended
    obtain ⟨ended, droppedEq, endedEq, rest⟩ := rest
    obtain ⟨resumedNone, resumedComplete, resumedOccur, _⟩ := rest
    rw [store_stored] at droppedEq
    have quieted : Quieted dropped ended := by
      rw [endedEq]
      cases run.leave with
      | none => exact .inl rfl
      | some occurrence => exact .inr ⟨_, Laws.Step.untriggered_cancel occurrence, rfl⟩
    subst droppedEq
    have ungrouped := (idle run first).2.2
    rcases resumed : run.resume with _ | ⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | context
    · rw [resumedNone resumed, quieted.slots]
      exact ⟨rfl, rfl⟩
    · have last : Quieted ended t := .inr ⟨_, Laws.Step.untriggered_complete _ _ _ _, resumedComplete _ _ resumed⟩
      rw [last.slots, quieted.slots]
      exact ⟨rfl, rfl⟩
    · have last : Quieted ended t := .inr ⟨_, Laws.Step.untriggered_occur _ _ _ _ _, resumedOccur _ _ _ resumed⟩
      rw [last.slots, quieted.slots]
      exact ⟨rfl, rfl⟩
    · rw [resumed] at ungrouped
      cases ungrouped
  · obtain ⟨later, started, _, rest⟩ := progressed
    obtain ⟨_, perm, progress, _⟩ := rest
    obtain ⟨pending, running, _⟩ := idle run first
    rw [pending] at perm
    have empty := List.perm_nil.mp perm
    simp only [List.append_eq_nil_iff, List.map_eq_nil_iff] at empty
    rcases progress with begun | held
    · exact absurd empty.2 begun
    · exact absurd running held

/-- What a compensation that is a `FreshCall` from a well-formed state keeping the lane relation does: it takes the
records it selects into a new run, which either, holding nothing, ends at once, changing no retained record and leaving
no run of its key, or advances once, beginning handlers that keep every record retained in an issued scope occurrence
and leave no run but the state's and freshly scoped ones. -/
theorem compensate_shape {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {state after : State}
    (before : WellFormed ctx.program state)
    (formed : Formed (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) state)
    (fresh : FreshCall state scope trigger resume)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) :
    ∃ taken others, TakesOut (· ∈ Feature.Compensation.visibleScopes ctx state scope) activity state.slots.compensation
        { retained := others, runs := state.slots.compensation.runs ++ [{ trigger, scope, pending := taken, leave, resume }] }
        { trigger, scope, pending := taken, leave, resume } ∧
      ((taken = [] ∧ after.slots.compensation.retained = others ∧ after.slots.compensation.runs =
          (state.slots.compensation.runs ++ [({ trigger, scope, pending := taken, leave, resume } : CompensationRun)]).filter
            (!Feature.Compensation.isRun scope trigger ·)) ∨
        ∃ (started : List (ScopeOccurrenceId × Compensable)) (begun : State) (next : CompensationRun),
          Advances (Depends ctx.program (footprintReads ctx) (footprintWrites ctx))
            ({ trigger, scope, pending := taken, leave, resume } : CompensationRun) next (started.map (·.2)) ∧ next.scope = scope ∧
          next.trigger = trigger ∧ BegunFormed (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) scope
            (started.map (·.2))
            (started.map (·.1)) (opened state others { trigger, scope, pending := taken, leave, resume }) begun ∧
          after = stored begun { begun.slots.compensation with
            runs := begun.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) ++ [next] }) := by
  obtain ⟨taken, others, rest⟩ := Laws.Compensation.compensate_spec ran
  obtain ⟨takes, perm, advanced⟩ := rest
  rw [store_stored] at advanced
  have firstNew : ∀ run, FirstOf (Keyed scope trigger)
      (state.slots.compensation.runs ++ [{ trigger, scope, pending := taken, leave, resume }]) run →
      run = { trigger, scope, pending := taken, leave, resume } := fun run first => by
    rcases List.mem_append.mp first.mem with old | new
    · exact absurd first.1.2 (fresh.1 run old first.1.1)
    · exact List.mem_singleton.mp new
  refine ⟨taken, others, takes, ?_⟩
  rcases taken with _ | ⟨record, rest⟩
  · have ended := advance_ended (fun run first => by rw [firstNew run first]; exact ⟨rfl, rfl, fresh.2⟩) advanced
    exact .inl ⟨rfl, ended⟩
  have stands : scope ∈ Laws.State.scopeIds state := by
    obtain ⟨retainedIn, covered, _⟩ := (takes.1 record).1 (List.mem_cons_self ..)
    rcases Laws.Compensation.visibleScopes_mem covered with same | ⟨entry, inside, named⟩
    · rw [← same]; exact formed.retained record retainedIn
    · exact List.mem_map.mpr ⟨entry, inside, named⟩
  have issued : Laws.State.ScopeIssued state scope := by
    obtain ⟨entry, inside, named⟩ := List.mem_map.mp stands
    exact named ▸ before.issued.scopes entry inside
  have tame := tame_opened (others := others) (run := { trigger, scope, pending := record :: rest, leave, resume })
    (tame_of before formed.retained formed.keyed formed.runsIssued formed.groupsStanding)
    (fun kept inside => perm.subset (List.mem_append_right _ inside)) fresh.1 issued rfl fresh.2
  obtain ⟨less, run, _, rest'⟩ := Laws.Compensation.advance_spec advanced
  obtain ⟨first, ended | progressed⟩ := rest'
  · rw [firstNew run first] at ended
    exact absurd ended.1 (List.cons_ne_nil _ _)
  obtain ⟨later, started, begun, rest'⟩ := progressed
  obtain ⟨law, _, _, rest'⟩ := rest'
  obtain ⟨chain, rfl⟩ := rest'
  obtain rfl := firstNew run first
  have post := chain_formed (runs_form (precedes_depends ctx) less).2.2 chain tame stands
    ⟨_, List.mem_append_right _ (List.mem_singleton_self _), rfl⟩
  rw [store_stored]
  exact .inr ⟨started, begun, _, advances_of (precedes_depends ctx) law, rfl, rfl, post, rfl⟩

/-- A settled run is one advance of itself, starting nothing. -/
theorem advances_settled {precedes : Compensable → Compensable → Prop} {run : CompensationRun}
    (settled : ∀ record, ¬ Ready precedes run record) : Advances precedes run run [] :=
  ⟨fun record => ⟨fun inside => (nomatch inside), fun ready => absurd ready (settled record)⟩,
    fun record => ⟨fun pending => ⟨pending, settled record⟩, And.left⟩, (List.append_nil _).symm⟩

theorem compensate_takesOut {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {state after : State}
    (before : WellFormed ctx.program state)
    (formed : Formed (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) state)
    (fresh : FreshCall state scope trigger resume)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) :
    ∃ covered taken kept, taken.trigger = trigger ∧ taken.scope = scope ∧ taken.running = [] ∧
      taken.leave = leave ∧ taken.resume = resume ∧
      TakesOut covered activity state.slots.compensation
        { retained := kept, runs := state.slots.compensation.runs ++ [taken] } taken ∧
      (∀ record, Laws.State.ScopeIssued state record.scope →
        (record ∈ after.slots.compensation.retained ↔ record ∈ kept)) ∧
      ((taken.pending = [] ∧ ∀ next ∈ after.slots.compensation.runs, next.scope = scope → next.trigger ≠ trigger) ∨
        ∃ next ∈ after.slots.compensation.runs, next.scope = scope ∧ next.trigger = trigger ∧
          ∃ started, Advances (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) taken next started) := by
  obtain ⟨taken, others, takes, shape⟩ := compensate_shape before formed fresh ran
  refine ⟨_, _, others, rfl, rfl, rfl, rfl, rfl, takes, ?_⟩
  rcases shape with ⟨rfl, retained, runs⟩ | ⟨started, begun, next, rest⟩
  · refine ⟨fun record _ => by rw [retained], .inl ⟨rfl, fun next inside sameScope sameTrigger => ?_⟩⟩
    rw [runs, List.mem_filter, Bool.not_eq_true', isRun_false] at inside
    exact inside.2 ⟨sameScope, sameTrigger⟩
  obtain ⟨law, scopeNamed, named, rest⟩ := rest
  obtain ⟨post, rfl⟩ := rest
  exact ⟨fun record below => post.retained record below,
    .inr ⟨next, List.mem_append_right _ (List.mem_singleton_self _), scopeNamed, named, _, law⟩⟩

theorem compensate_inOrder {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {state after : State}
    (before : WellFormed ctx.program state)
    (formed : Formed (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) state)
    (fresh : FreshCall state scope trigger resume)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after)
    {run next : CompensationRun} (member : run ∈ state.slots.compensation.runs)
    (inside : next ∈ after.slots.compensation.runs) (sameTrigger : next.trigger = run.trigger)
    (sameScope : next.scope = run.scope) :
    ∃ released started, Advances (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger := by
  have other : ¬ Keyed scope trigger next := fun keyed =>
    fresh.1 run member (sameScope.symm.trans keyed.1) (sameTrigger.symm.trans keyed.2)
  suffices same : next = run by
    subst same
    exact ⟨next, [], advances_settled (formed.settled next member), rfl, rfl⟩
  have unique : next ∈ state.slots.compensation.runs → next = run := fun inside' =>
    Laws.State.nodup_map_eq formed.keyed inside' member (by rw [sameScope, sameTrigger])
  obtain ⟨taken, others, _, shape⟩ := compensate_shape before formed fresh ran
  rcases shape with ⟨_, _, runs⟩ | ⟨started, begun, advanced, rest⟩
  · rw [runs, List.mem_filter] at inside
    rcases List.mem_append.mp inside.1 with older | new
    · exact unique older
    · refine absurd ?_ other
      rw [List.mem_singleton.mp new]
      exact ⟨rfl, rfl⟩
  obtain ⟨_, scopeNamed, named, rest⟩ := rest
  obtain ⟨post, rfl⟩ := rest
  rcases List.mem_append.mp inside with kept | new
  · rcases post.plain next (List.mem_filter.mp kept).1 with older | late
    · rcases List.mem_append.mp older with oldest | new
      · exact unique oldest
      · refine absurd ?_ other
        rw [List.mem_singleton.mp new]
        exact ⟨rfl, rfl⟩
    · have below := formed.runsIssued run member
      rw [← sameScope] at below
      exact absurd below late
  · rw [List.mem_singleton.mp new] at other
    exact absurd ⟨scopeNamed, named⟩ other

theorem handlerCompleted_inOrder {ctx : Ctx} {occurrence : Occurrence}
    {state after : State} (before : WellFormed ctx.program state)
    (formed : Formed (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) state)
    (stands : Laws.Step.ScopeStands state occurrence.scope)
    (ran : Feature.Compensation.handlerCompleted ctx occurrence state = .ok after)
    {run next : CompensationRun} (member : run ∈ state.slots.compensation.runs)
    (inside : next ∈ after.slots.compensation.runs) (sameTrigger : next.trigger = run.trigger)
    (sameScope : next.scope = run.scope) :
    ∃ released started, Advances (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) released next started ∧
      released.pending = run.pending ∧ released.trigger = run.trigger := by
  rw [Laws.Compensation.handlerCompleted_spec] at ran
  obtain ⟨less, _, fuel, _⟩ := Laws.Compensation.release_spec ran
  rw [fuel] at ran
  have post := (runs_form (precedes_depends ctx) (less + 1)).2.1 _ _ _
    (tame_of before formed.retained formed.keyed formed.runsIssued formed.groupsStanding) (List.mem_map.mpr stands) ran
  rcases post.steps next inside with late | ⟨source, sourceIn, rest⟩
  · have below := formed.runsIssued run member
    rw [← sameScope] at below
    exact absurd below late
  obtain ⟨sameSource, named, which⟩ := rest
  obtain rfl : source = run :=
    Laws.State.nodup_map_eq formed.keyed sourceIn member (by rw [sameSource, named, sameScope, sameTrigger])
  rcases which with rfl | found
  · exact ⟨next, [], advances_settled (formed.settled next member), rfl, rfl⟩
  · exact found

/-- The lane relation read under `hooks`' Step context is the one read under any context of the program. -/
theorem dependsIn_eq (hooks : Hooks) (ctx : Ctx) :
    DependsIn hooks footprintReads footprintWrites ctx.program = Depends ctx.program (footprintReads ctx) (footprintWrites ctx) :=
  funext fun record => funext fun other =>
    propext ((precedes_dependsIn hooks ctx record other).symm.trans (precedes_depends ctx record other))

/-- Under the registered hooks a compensation takes out once (`TakesOutOnce`). -/
theorem registered_takesOutOnce : TakesOutOnce Registry.hooks footprintReads footprintWrites := by
  intro ctx scope activity trigger leave resume state after before formed fresh ran
  rw [Laws.Registry.hooks_compensate] at ran
  exact compensate_takesOut before formed fresh ran

/-- Under the registered hooks handlers start in order (`HandlersInOrder`). -/
theorem registered_handlersInOrder : HandlersInOrder Registry.hooks footprintReads footprintWrites := by
  intro ctx state after run next before formed ran member inside sameTrigger sameScope
  rcases ran with ⟨scope, activity, trigger, rest⟩ | ⟨occurrence, ran⟩
  · obtain ⟨leave, resume, fresh, ran⟩ := rest
    rw [Laws.Registry.hooks_compensate] at ran
    exact compensate_inOrder before formed fresh ran member inside sameTrigger sameScope
  · obtain ⟨stands, ran⟩ := ran
    rw [Laws.Registry.hooks_handlerCompleted] at ran
    exact handlerCompleted_inOrder before formed stands ran member inside sameTrigger sameScope

/-- Every compensation `Step` performs takes out once and starts handlers in order: it is taken off a queue that kept
`WellFormed` and the lane relation (`Laws.State.Popped`, as `CompensationKeeps.compensate` reads it), so it is a
`FreshCall` (`compensationsFresh`) and `registered_takesOutOnce` and `registered_handlersInOrder` apply to it. -/
theorem registered_dequeued {ctx : Ctx} {scope : ScopeOccurrenceId} {activity : Option ElementId}
    {trigger : OccurrenceRef} {leave : Option OccurrenceId} {resume : Option Resume} {state after : State}
    (holds : WellFormed ctx.program state ∧ Formed (DependsIn Registry.hooks footprintReads footprintWrites ctx.program) state)
    (popped : Laws.State.Popped (fun queue => WellFormed ctx.program queue ∧
      Formed (DependsIn Registry.hooks footprintReads footprintWrites ctx.program) queue)
      (.compensate scope activity trigger leave resume) state)
    (ran : Registry.hooks.compensate ctx scope activity trigger leave resume state = .ok after) :
    FreshCall state scope trigger resume ∧
      (∃ covered taken kept, taken.trigger = trigger ∧ taken.scope = scope ∧ taken.running = [] ∧
        taken.leave = leave ∧ taken.resume = resume ∧
        TakesOut covered activity state.slots.compensation
          { retained := kept, runs := state.slots.compensation.runs ++ [taken] } taken ∧
        (∀ record, Laws.State.ScopeIssued state record.scope →
          (record ∈ after.slots.compensation.retained ↔ record ∈ kept)) ∧
        ((taken.pending = [] ∧ ∀ next ∈ after.slots.compensation.runs, next.scope = scope → next.trigger ≠ trigger) ∨
          ∃ next ∈ after.slots.compensation.runs, next.scope = scope ∧ next.trigger = trigger ∧
            ∃ started, Advances (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) taken next started)) ∧
      ∀ run ∈ state.slots.compensation.runs, ∀ next ∈ after.slots.compensation.runs, next.trigger = run.trigger →
        next.scope = run.scope → ∃ released started,
          Advances (Depends ctx.program (footprintReads ctx) (footprintWrites ctx)) released next started ∧
          released.pending = run.pending ∧ released.trigger = run.trigger := by
  obtain ⟨queue, unit, ⟨queueFormed, queueRelation⟩, rest₁⟩ := popped
  obtain ⟨found, shape⟩ := rest₁
  have fresh := compensationsFresh _ _ _ _ _ _ _ _ _ queueFormed queueRelation found
  rw [← shape] at fresh
  have formed := dependsIn_eq Registry.hooks ctx ▸ holds.2
  refine ⟨fresh, registered_takesOutOnce ctx scope activity trigger leave resume state after holds.1 formed fresh ran,
    fun run member next inside sameTrigger sameScope => ?_⟩
  exact registered_handlersInOrder ctx state after run next holds.1 formed
    (.inl ⟨scope, activity, trigger, leave, resume, fresh, ran⟩) member inside sameTrigger sameScope

/-! ## The Step context -/

/-- The context `Step.step` hands every hook answers the queries as `Step`'s does (`StepQueries`), so the statements
that read it hold of every hook call `Step` makes. -/
theorem stepQueries_inputCtx (hooks : Hooks) (program : Program) (input : Input) :
    StepQueries hooks (Laws.Step.inputCtx hooks program input) :=
  Laws.Step.inputCtx_queries hooks program input

/-! ## Cancel and failure -/

/-- A hooks record registers a raise (`RaiseRegistered`) when it registers Propagation's arrival and search,
Compensation's failure, Scopes' Event Sub-Process start and Subscriptions' catch, a Cancel caught only by a Cancel trigger
(`Laws.Subscriptions.catches_cancel`), over search hooks of Data's writes, which change only variables, Work's
Error-path leave, which queues only its host's completion, and Compensation's drop, which changes only the slot. -/
theorem raiseRegistered_of {hooks : Hooks} {propagation : Feature.Propagation.PropagationHooks}
    (arriveThrow : hooks.arriveThrow = Feature.Propagation.arriveThrow)
    (raise : hooks.raise = Feature.Propagation.raise propagation)
    (failCompensation : hooks.failCompensation = Feature.Compensation.failCompensation)
    (eventStart : hooks.eventStart = fun payload => (Feature.Scopes.eventStart payload).map
      fun (start, declared) => (start, Feature.Subscriptions.startInterrupts start declared))
    (catches : hooks.catches = Feature.Subscriptions.catches)
    (mapped : propagation.mappedErrorOutputs = Feature.Work.mappedErrorOutputs Feature.Data.writeOutputs)
    (caught : ∀ ctx scope writes,
      propagation.writeCaught ctx scope writes = Feature.Data.writeOutputs ctx scope writes .outward)
    (call : ∀ ctx root state, propagation.callOutputs ctx root state = do
      let (scope, writes) ← Feature.Work.Call.raisedOutputs ctx root state
      Feature.Data.writeOutputs ctx scope writes .outward state)
    (drop : propagation.dropRuns = Feature.Compensation.dropWithin) : RaiseRegistered hooks propagation where
  arriveThrow := arriveThrow
  raise := raise
  failCompensation := failCompensation
  eventStart payload start interrupting started := by
    rw [eventStart] at started
    obtain ⟨⟨_, declared⟩, read, same⟩ := Option.map_eq_some_iff.mp started
    cases same
    exact ⟨declared, Laws.Scopes.eventStart_kind read⟩
  cancelCatches _ caught := Laws.Subscriptions.catches_cancel (catches ▸ caught)
  callOutputs ctx root state _ ran := by
    rw [call] at ran
    obtain ⟨⟨_, _⟩, _, ran⟩ := Laws.Step.bind_ok ran
    refine Laws.Data.writeOutputs_induction (motive := fun t => Laws.State.Steady state t ∧
      Laws.State.allQueuedTokens t = Laws.State.allQueuedTokens state ∧ Laws.State.allSignals t = Laws.State.allSignals state ∧ t.slots = state.slots) (fun s target name value held => ?_)
      ⟨.refl _, rfl, rfl, rfl⟩ ran
    have same := Laws.State.setVariable_same s target name value
    exact ⟨held.1.trans (Proofs.Step.steady_of_same same), same.tokens.trans held.2.1,
      same.signals.trans held.2.2.1, same.slots.trans held.2.2.2⟩
  writeCaught ctx scope writes state _ ran :=
    Laws.Data.writeOutputs_induction (motive := fun t => Laws.State.allSignals t = Laws.State.allSignals state)
      (fun s target name value held => (Laws.State.setVariable_same s target name value).signals.trans held) rfl
      (caught ctx scope writes ▸ ran)
  mappedErrorOutputs _ _ _ state _ ran := by
    rw [mapped] at ran
    exact Laws.Work.mappedErrorOutputs_keeps (motive := Laws.Propagation.Appends _ state)
      (fun _ _ _ _ held wrote => held.trans (.same (Laws.Data.writeOutputs_induction
        (motive := fun t => Laws.State.allSignals t = _) (fun s target name value same =>
          (Laws.State.setVariable_same s target name value).signals.trans same) rfl wrote)))
      (fun _ host _ held => held.signal raiseFacts ⟨host, .raised, [], .outward, rfl⟩) (.refl _) ran
  dropRuns ctx scope state := by
    rw [drop]
    obtain ⟨_, made⟩ := (Proofs.Step.dropWithin_keeps (inv := fun _ => True) (program := ctx.program) (state := state)
      ⟨fun _ _ _ _ _ => trivial, fun _ _ => trivial,
        (Proofs.Step.registeredOps_wellFormed.compensation ctx.program).issued, fun _ _ _ => trivial⟩
      ctx scope trivial).2
    rw [made]
    rfl

/-- The registered hooks register a raise. -/
theorem raiseRegistered : ∃ propagation, RaiseRegistered Registry.hooks propagation :=
  ⟨_, raiseRegistered_of Laws.Registry.hooks_arriveThrow Laws.Registry.hooks_raise Laws.Registry.hooks_failCompensation
    Laws.Registry.hooks_eventStart Laws.Registry.hooks_catches (by simp only) (fun _ _ _ => by simp only)
    (fun _ _ _ => by simp only) (by simp only)⟩

/-- Cancel propagation holds of the registered hooks. -/
theorem registered_cancelCompensatesFirst : CancelCompensatesFirst Registry.hooks :=
  raiseRegistered.elim fun _ registered => cancelCompensatesFirst_of registered

/-- Failure holds of the registered hooks. -/
theorem registered_handlerFailure : HandlerFailure Registry.hooks :=
  raiseRegistered.elim fun _ registered => handlerFailure_of registered

/-! ## The lane relation across inputs -/

/-- `WellFormed` with the lane relation read under the registered hooks' Step context beside it. -/
def RegisteredFormed (program : Program) (s : State) : Prop :=
  WellFormed program s ∧ Formed (DependsIn Registry.hooks footprintReads footprintWrites program) s

/-- The registered hooks keep `RegisteredFormed`: the other features' records from `WellFormed`'s and the lane's frame
instances (`formed_frameAlongside`, `formed_occursAlongside`, `formed_alongside`), the compensation hooks by what
`compensationKeeps_formed` proves of each. -/
theorem registeredFormed_contract : Laws.Step.HookContract Registry.hooks RegisteredFormed :=
  Proofs.Step.registered_contract_of
    (featureOps_frame Proofs.Step.registeredOps_wellFormed.toFeatureOps
      (fun program => formed_frameAlongside (DependsIn Registry.hooks footprintReads footprintWrites program) program)
      (fun program => formed_occursAlongside program (DependsIn Registry.hooks footprintReads footprintWrites program)))
    (Proofs.Step.multiInstanceKeeps_of fun program =>
      multiInstanceOps_alongside (formed_alongside (DependsIn Registry.hooks footprintReads footprintWrites program) program)
        (Proofs.Step.registeredOps_wellFormed.multiInstance program))
    registered_compensationKeeps Proofs.State.stateFacts

/-- `Step`'s phases keep `RegisteredFormed`. -/
theorem registeredFormed_phases : Laws.Step.Phases RegisteredFormed :=
  phases_alongside Proofs.Step.phases
    (fun program => formed_stepAlongside (DependsIn Registry.hooks footprintReads footprintWrites program) program
      fun _ _ _ _ precede => precede)
    fun _ => Formed.reissue

/-- Clearing an input's journal, intents, draft and writes keeps `RegisteredFormed`. -/
theorem registeredFormed_reset {program : Program} {s : State} (holds : RegisteredFormed program s)
    (committed : Laws.State.Committed s) :
    RegisteredFormed program { s with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [], completionBase := s.nextCompletion } :=
  ⟨Laws.State.reset_wellFormed holds.1 committed, holds.2.same rfl rfl (Nat.le_refl _) rfl rfl (.refl _)⟩

/-- A start's fresh instance holds no record, run or trigger. -/
theorem formed_initial (precedes : Compensable → Compensable → Prop) (instanceId : String)
    (variables : List (String × Value)) (businessKey : Option String) :
    Formed precedes ((State.initial instanceId variables businessKey).signal (.armScope State.root)) := by
  refine Formed.signal ?_ _
  rw [Laws.State.initial_eq]
  refine ⟨?_, ?_, ?_, ?_, ?_, ?_, ?_, ?_, ⟨?_, ?_, ?_, ?_, ?_⟩, ?_, ?_⟩ <;>
    simp [ClaimsApart, RetainedPresent, RunsUnfinished, CompletionsApart, CompletionsIssued, completions, completionsIn,
      RunsSettled, RunsKeyed, RunsIssued, GroupsStanding, heldTriggers, queuedTriggers, QueuedUngrouped, Laws.State.allSignals,
      Laws.Step.triggersOf_nil]

/-- A committed input keeps `RegisteredFormed` under the registered hooks. -/
theorem registeredFormed_stepKeeps {program : Program} {input : Input} {before after : State}
    (holds : RegisteredFormed program before) (committed : Laws.State.Committed before)
    (ran : Step.step Registry.hooks program (some before) input = .ok after) :
    RegisteredFormed program after ∧ Laws.State.Committed after :=
  Proofs.State.running_keeps registeredFormed_contract registeredFormed_phases
    (Laws.Step.complete_keeps registeredFormed_contract registeredFormed_phases.toBodyPhases
      (formed_pipelinePhases (fun program => DependsIn Registry.hooks footprintReads footprintWrites program)
        Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1) committed
    (registeredFormed_reset holds committed) ran

/-- A committed start makes a `RegisteredFormed` state under the registered hooks. -/
theorem registeredFormed_start {program : Program} {input : Input} {after : State}
    (ran : Step.step Registry.hooks program none input = .ok after) :
    RegisteredFormed program after ∧ Laws.State.Committed after :=
  Proofs.State.step_keeps registeredFormed_contract registeredFormed_phases
    (Laws.Step.complete_keeps registeredFormed_contract registeredFormed_phases.toBodyPhases
      (formed_pipelinePhases (fun program => DependsIn Registry.hooks footprintReads footprintWrites program)
        Proofs.Step.pipelinePhases) Proofs.State.stateFacts)
    Proofs.Step.registered_framing Proofs.Step.registered_keysAux (fun _ _ holds => holds.1)
    (fun _ _ => registeredFormed_reset)
    (fun instanceId variables businessKey => ⟨Proofs.Step.initial_wellFormed program instanceId variables businessKey,
      formed_initial _ instanceId variables businessKey⟩)
    (fun _ given => by simp at given) ran

/-- A committed input keeps the lane relation under the registered hooks. -/
theorem registered_commits {program : Program} {before after : State}
    (commits : Commits Registry.hooks footprintReads footprintWrites program before after) :
    RegisteredFormed program after :=
  have ⟨formed, committed, relation, ⟨_, ran⟩⟩ := commits
  (registeredFormed_stepKeeps ⟨formed, relation⟩ committed ran).1

/-- No record a run claimed is retained again under the registered hooks. -/
theorem registered_claimsStayApart : ClaimsStayApart Registry.hooks footprintReads footprintWrites :=
  fun _ _ _ commits => (registered_commits commits).2.claims

/-- Every retained record lies in a present scope occurrence under the registered hooks. -/
theorem registered_retainedInPresentScopes : RetainedInPresentScopes Registry.hooks footprintReads footprintWrites :=
  fun _ _ _ commits => (registered_commits commits).2.retained

/-- No finished run is left after a committed input under the registered hooks. -/
theorem registered_noFinishedRunLeft : NoFinishedRunLeft Registry.hooks footprintReads footprintWrites :=
  fun _ _ _ commits => (registered_commits commits).2.unfinished

/-- A committed start keeps the lane relation under the registered hooks. -/
theorem registered_compensationsFormedAtStart :
    CompensationsFormedAtStart Registry.hooks footprintReads footprintWrites :=
  fun _ _ _ ran => (registeredFormed_start ran).1.2

/-- Every instance a committed population run holds keeps the lane relation under the registered hooks. -/
theorem registered_compensationsFormedInPopulation :
    CompensationsFormedInPopulation Registry.hooks footprintReads footprintWrites := fun _ _ _ ran member inside =>
  (Laws.Population.runStimuli_held (good := fun program s => RegisteredFormed program s ∧ Laws.State.Committed s)
    ⟨fun _ _ _ _ holds stepped => registeredFormed_stepKeeps holds.1 holds.2 stepped,
      fun _ _ _ ran => registeredFormed_start ran⟩
    ran member inside).1.2

end Kernel.Proofs.Compensation
