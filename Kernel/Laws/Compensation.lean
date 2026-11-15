module

public import Kernel.Hooks
public import Kernel.Feature.Compensation
public import Kernel.Laws.Compensation.Rules
public import Kernel.Laws.Compensation.Runs
import all Kernel.Feature.Compensation

/-! # Laws of compensation and Transaction cancellation: the hooks

What `Kernel.Feature.Compensation`'s hooks keep and do: an invariant of the proof wave through the operations records
`CompensationOps` and `RunsOps` (`Kernel.Laws.Compensation.Runs`), and the fuel induction over beginning, advancing and
releasing runs. This is the one module that sees the feature's bodies; the rules they are held to are
`Kernel.Laws.Compensation.Rules`'. Nothing executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Compensation

open Kernel

/-! ## Preservation

What the compensation hooks keep of an invariant: a completion retains its record, issuing a completion number, and a
handler's uncaught failure ends the instance failed. -/

/-- What the compensation hooks need of the state operations they apply, for an invariant `inv`. -/
structure CompensationOps (inv : State → Prop) : Prop where
  /-- The retained records replaced, and the runs by some of them. -/
  store : ∀ state compensation, inv state → (∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs) →
    inv { state with slots := { state.slots with compensation } }
  issue : ∀ state, inv state → inv state.issue.1
  /-- Issuing keeps the scope occurrences, the occurrences, the open items and the slots. -/
  issued : ∀ state : State, state.issue.1.scopes = state.scopes ∧ state.issue.1.occurrences = state.occurrences ∧
    state.issue.1.openItems = state.openItems ∧ state.issue.1.slots = state.slots
  fail : ∀ state failure, inv state → inv (state.signal (.endInstance .failed (some failure)))

/-- `Hooks.completed` keeps `inv`, the scope occurrences, the occurrences and the open items. -/
theorem completed_keeps {inv : State → Prop} (ops : CompensationOps inv) {ctx : Ctx} {occurrence : Occurrence}
    {state after : State} (holds : inv state) (ran : Feature.Compensation.completed ctx occurrence state = .ok after) :
    inv after ∧ after.scopes = state.scopes ∧ after.occurrences = state.occurrences ∧ after.openItems = state.openItems := by
  unfold Feature.Compensation.completed at ran
  split at ran
  · cases ran
    exact ⟨holds, rfl, rfl, rfl⟩
  · have issued := ops.issued state
    have kept := ops.issue state holds
    dsimp only at ran
    split at ran
    · cases ran
      exact ⟨ops.store _ _ holds fun _ member => member, rfl, rfl, rfl⟩
    · cases ran
      obtain ⟨scopes, occurrences, items, slots⟩ := issued
      exact ⟨ops.store _ _ kept fun _ member => slots ▸ member, scopes, occurrences, items⟩

/-- Dropping the runs inside a scope occurrence an interrupting catcher decided on (`Feature.Compensation.dropWithin`)
keeps `inv` and changes only the compensation slot. -/
theorem dropWithin_keeps {inv : State → Prop} (ops : CompensationOps inv) (ctx : Ctx) (scope : ScopeOccurrenceId)
    {state : State} (holds : inv state) : inv (Feature.Compensation.dropWithin ctx scope state) ∧
      ∃ compensation, Feature.Compensation.dropWithin ctx scope state = { state with slots := { state.slots with compensation } } :=
  ⟨ops.store _ _ holds fun _ member => (List.mem_filter.mp member).1, _, rfl⟩

/-- `Hooks.failCompensation` keeps `inv`. -/
theorem failCompensation_keeps {inv : State → Prop} (ops : CompensationOps inv) {ctx : Ctx} {handler : ScopeOccurrenceId}
    {code : String} {message : Option String} {origin : Origin} {state after : State} (holds : inv state)
    (ran : Feature.Compensation.failCompensation ctx handler code message origin state = .ok after) : inv after := by
  unfold Feature.Compensation.failCompensation at ran
  simp only [bind, Except.bind] at ran
  repeat' split at ran
  all_goals cases ran
  all_goals exact ops.fail _ _ holds

/-! ## Runs

The fuel induction over `Compensation.beginHandler`, `advance` and `release`, from the statements and the operations
record of `Kernel.Laws.Compensation.Runs`. A run's handlers begin in contexts entered afresh, so the contexts it holds
running are each a running context of the state it is stored in or no active Multi-Instance instance's scope occurrence,
which were all issued before (`RunsOps.slotsIssued`); a nested group's run never drops a run whose scope occurrence
stood, so the advancing run holds its earlier contexts still when it is stored. -/

/-- What `Compensation.advance` keeps at `fuel` (`Advanced`). -/
def AdvanceKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ scope trigger state after, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.advance ctx scope trigger state fuel = .ok after → Advanced inv settled scope state after

/-- What `Compensation.release` keeps at `fuel` of a context that stands. -/
def ReleaseKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ context state after, inv state → context ∈ state.scopes.map (·.id) →
    Feature.Compensation.release ctx context state fuel = .ok after → inv after ∧ Follows settled state after

/-- What `Compensation.beginHandler` keeps at `fuel` in a scope occurrence that stands (`Begun`). -/
def BeginKeeps (inv : State → Prop) (settled : State → Nat → Prop) (ctx : Ctx) (fuel : Nat) : Prop :=
  ∀ trigger scope state record after context, inv state → scope ∈ state.scopes.map (·.id) →
    Feature.Compensation.beginHandler ctx trigger scope state record fuel = .ok (after, context) →
      Begun inv settled scope state after context

/-- Ending the run `trigger` started in `scope` keeps every run of another scope occurrence. -/
theorem filter_kept {scope : ScopeOccurrenceId} {trigger : OccurrenceRef} {runs : List CompensationRun}
    {run : CompensationRun} (member : run ∈ runs) (other : run.scope ≠ scope) :
    run ∈ runs.filter (!Feature.Compensation.isRun scope trigger ·) :=
  List.mem_filter.mpr ⟨member, by simp [Feature.Compensation.isRun, other]⟩

theorem ended_store {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) (scope : ScopeOccurrenceId) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs)
    (kept : ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ compensation.runs) :
    Ended inv settled scope state (Feature.Compensation.store state compensation) :=
  have stored := ops.store state compensation holds (fun run member => .inl (held run member)) (held_running held)
    (held_resumes holds held)
  ⟨stored.1, .same stored.2 rfl rfl rfl, rfl, held, kept⟩

theorem ended_cancel {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) (scope : ScopeOccurrenceId) (compensation : Compensations)
    (held : ∀ run ∈ compensation.runs, run ∈ state.slots.compensation.runs)
    (kept : ∀ run ∈ state.slots.compensation.runs, run.scope ≠ scope → run ∈ compensation.runs) (occurrence : Nat) :
    Ended inv settled scope state ((Feature.Compensation.store state compensation).signal (.cancel occurrence)) :=
  have stored := ended_store ops holds scope compensation held kept
  have cancelled := ops.cancel _ occurrence stored.1
  have shape := ops.signalled (Feature.Compensation.store state compensation) (.cancel occurrence)
  ⟨cancelled.1, stored.2.1.trans (.same cancelled.2 shape.1 shape.2.1 (congrArg (·.multiInstances) shape.2.2)),
    shape.1.trans stored.2.2.1, fun run member => by
      rw [shape.2.2] at member
      exact held run member, fun run member other => by
      rw [shape.2.2]
      exact kept run member other⟩

/-- A group's nested run that ends releases its own context, which no run holds while the outer run's handlers begin. -/
theorem Ended.group {inv : State → Prop} {settled : State → Nat → Prop} {ctx : Ctx} {fuel : Nat}
    (releases : ReleaseKeeps inv settled ctx fuel) {state ended after : State} {scope : ScopeOccurrenceId}
    (done : Ended inv settled scope state ended) (stands : scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.release ctx scope ended fuel = .ok after) : Advanced inv settled scope state after := by
  have released := releases scope ended after done.1 (done.2.2.1 ▸ stands) ran
  refine ⟨released.1, done.2.1.trans released.2, fun unheld => ?_⟩
  cases fuel with
  | zero => simp [Feature.Compensation.release] at ran
  | succ fuel =>
    simp only [Feature.Compensation.release] at ran
    split at ran
    · cases ran
    · rename_i owner found
      have holding := List.find?_some found
      obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
      exact absurd (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)
        (unheld owner (done.2.2.2.1 owner (List.mem_of_find?_eq_some found)))

/-- A handler begun in a context entered below a scope occurrence that stands keeps what `Compensation.beginHandler`
keeps. -/
theorem handler_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {state : State}
    (holds : inv state) {scope : ScopeOccurrenceId} (stands : scope ∈ state.scopes.map (·.id)) (handler : ElementId)
    {locals : List (String × Value)} (compensation : Compensations)
    (runs : compensation.runs = (state.enterScope handler scope locals none).1.slots.compensation.runs) :
    Begun inv settled scope state ((Feature.Compensation.store (state.enterScope handler scope locals none).1
      compensation).signal (.begin
        { element := handler, scope := (state.enterScope handler scope locals none).2, continuation := .compensation scope }))
      (state.enterScope handler scope locals none).2 := by
  obtain ⟨named, issuedNext, scopesEq, slotsEq⟩ := ops.entered state handler scope locals
  have enter := ops.enter state handler scope locals holds stands
  generalize entering : state.enterScope handler scope locals none = entered at named issuedNext scopesEq slotsEq enter runs
  have fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩ := fun entry member same => by
    have below := ops.issued state holds entry member
    rw [same] at below
    exact Nat.lt_irrefl _ below
  have stored := ops.store entered.1 compensation enter.1 (fun run member => .inl (runs ▸ member))
    (held_running fun run member => runs ▸ member) (held_resumes enter.1 fun run member => runs ▸ member)
  have standsEntered : entered.2 ∈ (Feature.Compensation.store entered.1 compensation).scopes.map (·.id) := by
    change _ ∈ entered.1.scopes.map _
    rw [scopesEq, named]
    simp
  have begun := ops.begin _ handler _ scope stored.1 standsEntered
  have shape := ops.signalled (Feature.Compensation.store entered.1 compensation)
    (.begin { element := handler, scope := entered.2, continuation := .compensation scope })
  have scopesAfter : ((Feature.Compensation.store entered.1 compensation).signal
      (.begin { element := handler, scope := entered.2, continuation := .compensation scope })).scopes = state.scopes ++
      [{ id := ⟨state.nextIssue⟩, element := some handler, parent := some scope, occurrence := none }] :=
    shape.1.trans scopesEq
  refine ⟨begun.1, ⟨?_, fun entry member => ?_, fun id settled => begun.2 id (stored.2 id (enter.2 id settled)),
    fun body member => ?_⟩, fun entry member => by rw [scopesAfter]; exact List.mem_append_left _ member,
    ⟨by rw [named]; exact Nat.le_refl _, ?_⟩, fun entry member same => ?_, fun run member _ => ?_⟩
  · rw [shape.2.1]
    change state.nextIssue ≤ entered.1.nextIssue
    omega
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      exact .inr (Nat.le_refl _)
  · rw [shape.2.2] at member
    change body ∈ entered.1.slots.multiInstances at member
    rwa [slotsEq] at member
  · rw [shape.2.1]
    change entered.2.value < entered.1.nextIssue
    rw [named, issuedNext]
    exact Nat.lt_succ_self _
  · rw [scopesAfter] at member
    rcases List.mem_append.mp member with old | new
    · exact absurd (same.trans named) (fresh entry old)
    · rw [List.mem_singleton.mp new]
  · rw [shape.2.2]
    change run ∈ compensation.runs
    rw [runs, slotsEq]
    exact member

theorem runs_keep {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) (ctx : Ctx) :
    ∀ fuel, AdvanceKeeps inv settled ctx fuel ∧ ReleaseKeeps inv settled ctx fuel ∧ BeginKeeps inv settled ctx fuel
  | 0 => ⟨fun _ _ _ _ _ _ ran => by simp [Feature.Compensation.advance] at ran,
    fun _ _ _ _ _ ran => by simp [Feature.Compensation.release] at ran,
    fun _ _ _ _ _ _ _ _ ran => by simp [Feature.Compensation.beginHandler] at ran⟩
  | fuel + 1 => by
    obtain ⟨advances, releases, begins⟩ := runs_keep ops ctx fuel
    refine ⟨?_, ?_, ?_⟩
    · intro scope trigger state after holds stands ran
      simp only [Feature.Compensation.advance, bind, Except.bind] at ran
      split at ran
      · rename_i run found
        have member := List.mem_of_find?_eq_some found
        have own : run.scope = scope := by
          have := List.find?_some found
          simp only [Feature.Compensation.isRun, Bool.and_eq_true, beq_iff_eq] at this
          exact this.1
        have fits := ops.fits state run holds member
        have held : ∀ other ∈ state.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·),
            other ∈ state.slots.compensation.runs := fun _ kept => (List.mem_filter.mp kept).1
        have kept : ∀ other ∈ state.slots.compensation.runs, other.scope ≠ scope →
            other ∈ state.slots.compensation.runs.filter (!Feature.Compensation.isRun scope trigger ·) :=
          fun _ member other => filter_kept member other
        split at ran
        · rcases resumed : run.resume with _ | (⟨occurrence, leave⟩ | ⟨element, at_, leave⟩ | ⟨outer, context⟩) <;>
            simp only [resumed] at ran <;> rcases left : run.leave with _ | cancelled <;> simp only [left] at ran
          · cases ran
            exact (ended_store ops holds scope _ held kept).done
          · cases ran
            exact (ended_cancel ops holds scope _ held kept _).done
          · cases ran
            exact (ended_store ops holds scope _ held kept).complete ops (fits.1 _ _ resumed) _ _ _
          · cases ran
            exact (ended_cancel ops holds scope _ held kept _).complete ops (fits.1 _ _ resumed) _ _ _
          · cases ran
            exact (ended_store ops holds scope _ held kept).queue ops
              (ops.occur _ _ _ _ _ _ (ended_store ops holds scope _ held kept).1 (held_pending holds member resumed))
          · cases ran
            exact (ended_cancel ops holds scope _ held kept _).queue ops
              (ops.occur _ _ _ _ _ _ (ended_cancel ops holds scope _ held kept _).1 (held_pending holds member resumed))
          · obtain rfl := (fits.2.1 _ _ resumed).trans own
            exact (ended_store ops holds _ _ held kept).group releases stands ran
          · obtain rfl := (fits.2.1 _ _ resumed).trans own
            exact (ended_cancel ops holds _ _ held kept _).group releases stands ran
        · split at ran
          · cases ran
          · split at ran
            · cases ran
            · rename_i started folded
              cases ran
              have kept := foldlM_keeps (fun (now : State × List (ScopeOccurrenceId × Compensable)) =>
                  inv now.1 ∧ Follows settled state now.1 ∧ (∀ entry ∈ state.scopes, entry ∈ now.1.scopes) ∧
                    (∀ context ∈ now.2.map (·.1), (state.nextIssue ≤ context.value ∧ context.value < now.1.nextIssue) ∧
                      ∀ entry ∈ now.1.scopes, entry.id = context → entry.parent = some scope) ∧
                    ∀ other ∈ state.slots.compensation.runs, other.scope ∈ state.scopes.map (·.id) →
                      other ∈ now.1.slots.compensation.runs) _ _ _ _
                (fun now record next _ holdsNow began => by
                  split at began
                  · cases began
                  · rename_i begun beganNow
                    cases began
                    obtain ⟨nowHolds, nowFollows, nowKept, rest⟩ := holdsNow
                    obtain ⟨nowPlaced, nowRuns⟩ := rest
                    obtain ⟨keptBegun, followsBegun, keptAll, rest⟩ := begins _ _ _ _ begun.1 begun.2 nowHolds
                      (List.mem_map.mpr ((List.mem_map.mp (stands)).imp fun _ found =>
                        ⟨nowKept _ found.1, found.2⟩)) beganNow
                    obtain ⟨bounds, placed, runsBegun⟩ := rest
                    refine ⟨keptBegun, nowFollows.trans followsBegun, fun entry member => keptAll entry (nowKept entry member),
                      fun context running => ?_, fun other member stood => runsBegun other (nowRuns other member stood)
                        (List.mem_map.mpr ((List.mem_map.mp stood).imp fun _ found => ⟨nowKept _ found.1, found.2⟩))⟩
                    simp only [List.map_append, List.mem_append, List.map_cons, List.map_nil, List.mem_singleton] at running
                    rcases running with old | rfl
                    · obtain ⟨oldBounds, oldPlaced⟩ := nowPlaced context old
                      refine ⟨⟨oldBounds.1, Nat.lt_of_lt_of_le oldBounds.2 followsBegun.1⟩, fun entry member named => ?_⟩
                      rcases followsBegun.2.1 entry member with inside | fresh
                      · exact oldPlaced entry inside named
                      · rw [named] at fresh
                        omega
                    · exact ⟨⟨Nat.le_trans nowFollows.1 bounds.1, bounds.2⟩, placed⟩)
                ⟨holds, .refl _, fun _ member => member, fun _ running => by simp at running,
                  fun _ member _ => member⟩ folded
              obtain ⟨keptHolds, keptFollows, keptScopes, rest⟩ := kept
              obtain ⟨keptPlaced, keptRuns⟩ := rest
              refine ⟨(ops.store started.1 _ keptHolds ?fit ?contexts ?resumes).1, keptFollows.trans
                (.same (ops.store started.1 _ keptHolds ?fit ?contexts ?resumes).2 rfl rfl rfl), fun _ => ⟨fun entry member =>
                keptScopes entry member, fun other member stood differs =>
                  List.mem_append_left _ (filter_kept (keptRuns other member stood) differs)⟩⟩
              case fit =>
                intro other member
                rcases List.mem_append.mp member with old | new
                · exact .inl (List.mem_filter.mp old).1
                · rw [List.mem_singleton.mp new]
                  refine .inr ⟨fun occurrence leave resumes => keptFollows.2.2.1 _ (fits.1 occurrence leave resumes),
                    fits.2.1, fun context running => ?_⟩
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · obtain ⟨oldBelow, oldPlaced⟩ := fits.2.2 context old
                    refine ⟨Nat.lt_of_lt_of_le oldBelow keptFollows.1, fun entry member named => ?_⟩
                    rcases keptFollows.2.1 entry member with inside | fresh
                    · exact oldPlaced entry inside named
                    · rw [named] at fresh
                      omega
                  · exact ⟨(keptPlaced context started).1.2, own ▸ (keptPlaced context started).2⟩
              case contexts =>
                intro other inside context running
                rcases List.mem_append.mp inside with old | new
                · exact .inl ⟨other, (List.mem_filter.mp old).1, running⟩
                · rw [List.mem_singleton.mp new] at running
                  simp only [List.map_append, List.mem_append] at running
                  rcases running with old | started
                  · exact .inl ⟨run, keptRuns run member (own ▸ stands), old⟩
                  · refine .inr fun body inside active => ?_
                    have below := ops.slotsIssued state holds body (keptFollows.2.2.2 body inside) context active
                    have above := (keptPlaced context started).1.1
                    omega
              case resumes =>
                exact appended_resumes keptHolds (fun _ old => (List.mem_filter.mp old).1)
                  fun _ _ _ resumed => held_pending holds member resumed
      · cases ran
    · intro context state after holds stands ran
      simp only [Feature.Compensation.release] at ran
      split at ran
      · cases ran
      · rename_i owner found
        have member := List.mem_of_find?_eq_some found
        have holding := List.find?_some found
        obtain ⟨pair, running, named⟩ := List.any_eq_true.mp holding
        obtain ⟨entry, inside, rfl⟩ := List.mem_map.mp stands
        have link := ((ops.fits state owner holds member).2.2 entry.id
          (List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩)).2 entry inside rfl
        obtain ⟨left, parentStands, rest⟩ := ops.leave state entry owner.scope holds inside link
          ⟨owner, member, List.mem_map.mpr ⟨pair, running, beq_iff_eq.mp named⟩⟩
        obtain ⟨issued, kept, leftBodies, leftSettled⟩ := rest
        have mapped : ∀ run ∈ (state.leaveScope entry.id).slots.compensation.runs.map fun candidate =>
            if Feature.Compensation.isRun owner.scope owner.trigger candidate then
              { candidate with running := candidate.running.filter (·.1 != entry.id) }
            else candidate, ∃ candidate ∈ (state.leaveScope entry.id).slots.compensation.runs,
              (∀ context ∈ run.running.map (·.1), context ∈ candidate.running.map (·.1)) ∧
                (run ∈ (state.leaveScope entry.id).slots.compensation.runs ∨ Fits settled (state.leaveScope entry.id) run) :=
          fun run held => by
            obtain ⟨candidate, inLeft, rfl⟩ := List.mem_map.mp held
            refine ⟨candidate, inLeft, ?_⟩
            split
            · have fits := ops.fits _ candidate left inLeft
              exact ⟨fun context running => (List.filter_sublist.map _).subset running, .inr ⟨fits.1, fits.2.1,
                fun context running => fits.2.2 context ((List.filter_sublist.map _).subset running)⟩⟩
            · exact ⟨fun _ running => running, .inl inLeft⟩
        have stored := ops.store (state.leaveScope entry.id) { (state.leaveScope entry.id).slots.compensation with
            runs := (state.leaveScope entry.id).slots.compensation.runs.map fun candidate =>
              if Feature.Compensation.isRun owner.scope owner.trigger candidate then
                { candidate with running := candidate.running.filter (·.1 != entry.id) }
              else candidate } left (fun run held => by obtain ⟨_, _, _, fits⟩ := mapped run held; exact fits)
          (fun run held context running => by
            obtain ⟨candidate, inLeft, inside, _⟩ := mapped run held
            exact .inl ⟨candidate, inLeft, inside context running⟩)
          fun run held element at_ leave resumed => by
            obtain ⟨candidate, inLeft, same⟩ := List.mem_map.mp held
            refine held_pending (at_ := at_) (leave := leave) left inLeft ?_
            rw [← same] at resumed
            split at resumed <;> exact resumed
        obtain ⟨kept', follows, -⟩ := advances owner.scope owner.trigger _ after stored.1 parentStands ran
        refine ⟨kept', Follows.trans ?_ follows⟩
        exact ⟨Nat.le_of_eq issued.symm, fun entry member => .inl (kept entry member),
          fun id settled => stored.2 id (leftSettled id settled), leftBodies⟩
    · intro trigger scope state record after context holds stands ran
      simp only [Feature.Compensation.beginHandler] at ran
      have fresh : ∀ entry ∈ state.scopes, entry.id ≠ ⟨state.nextIssue⟩ := fun entry member same => by
        have below := ops.issued state holds entry member
        rw [same] at below
        exact Nat.lt_irrefl _ below
      have follows : ∀ element, Follows settled state (state.enterScope element scope record.snapshot none).1 :=
        fun element => by
          obtain ⟨_, issuedNext, scopesEq, slotsEq⟩ := ops.entered state element scope record.snapshot
          refine ⟨by omega, fun entry member => ?_, (ops.enter state element scope record.snapshot holds stands).2,
            fun body member => by rw [slotsEq] at member; exact member⟩
          rw [scopesEq] at member
          rcases List.mem_append.mp member with old | new
          · exact .inl old
          · rw [List.mem_singleton.mp new]
            exact .inr (Nat.le_refl _)
      rcases handlerOf : record.handler with _ | handler <;> simp only [handlerOf] at ran
      · simp only [bind, Except.bind] at ran
        split at ran
        · cases ran
        · rename_i nestedAfter nested
          cases ran
          obtain ⟨named, issuedNext, scopesEq, slotsEq⟩ := ops.entered state record.subject scope record.snapshot
          have entering := follows record.subject
          have enter := ops.enter state record.subject scope record.snapshot holds stands
          rw [named] at nested ⊢
          generalize (state.enterScope record.subject scope record.snapshot none).1 = entered
            at nested issuedNext scopesEq slotsEq enter entering
          have stored : ∀ pending, inv (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runs ++
                [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))]))) ∧
              ∀ id, settled entered id → settled (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
                (entered.slots.compensation.runs ++
                  [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))]))) id :=
            fun pending => by
              refine ops.store entered _ enter.1 (fun run member => ?_) (fun run member context running => ?_)
                (appended_resumes enter.1 (fun _ old => old) fun _ _ _ same => by cases same)
              · rcases List.mem_append.mp member with old | new
                · exact .inl old
                · rw [List.mem_singleton.mp new]
                  refine .inr ⟨fun _ _ same => ?_, fun _ _ same => ?_, fun _ running => ?_⟩
                  · cases same
                  · cases same
                    rfl
                  · simp at running
              · rcases List.mem_append.mp member with old | new
                · exact .inl ⟨run, old, running⟩
                · rw [List.mem_singleton.mp new] at running
                  simp at running
          have standsNested : ⟨state.nextIssue⟩ ∈ entered.scopes.map (·.id) := by
            rw [scopesEq]
            simp
          obtain ⟨nestedHolds, nestedFollows, keeps⟩ := advances _ _ _ _ (stored _).1 standsNested nested
          have unheld : ∀ pending, Unheld (Feature.Compensation.store entered (.mk entered.slots.compensation.retained
              (entered.slots.compensation.runs ++
                [.mk trigger ⟨state.nextIssue⟩ pending [] none (some (.group scope ⟨state.nextIssue⟩))])))
              ⟨state.nextIssue⟩ := fun _ run member running => by
            rcases List.mem_append.mp member with old | new
            · have below := ((ops.fits state run holds (slotsEq ▸ old)).2.2 _ running).1
              exact Nat.lt_irrefl _ below
            · rw [List.mem_singleton.mp new] at running
              simp at running
          obtain ⟨keepsScopes, keepsRuns⟩ := keeps (unheld _)
          refine ⟨nestedHolds, entering.trans ((Follows.same (stored _).2 rfl rfl rfl).trans nestedFollows),
            fun entry member => keepsScopes entry
              (by rw [Feature.Compensation.store, scopesEq]; exact List.mem_append_left _ member),
            ⟨Nat.le_refl _, Nat.lt_of_lt_of_le (by change state.nextIssue < entered.nextIssue; omega) nestedFollows.1⟩,
            fun entry member named => ?_, fun run member stood => keepsRuns run ?_ ?_ ?_⟩
          · rcases nestedFollows.2.1 entry member with inside | later
            · change entry ∈ entered.scopes at inside
              rw [scopesEq] at inside
              rcases List.mem_append.mp inside with old | new
              · exact absurd named (fresh entry old)
              · rw [List.mem_singleton.mp new]
            · change entered.nextIssue ≤ entry.id.value at later
              rw [named] at later
              simp at later
              omega
          · exact List.mem_append_left _ (slotsEq ▸ member)
          · rw [Feature.Compensation.store, scopesEq]
            obtain ⟨found, inside, same⟩ := List.mem_map.mp stood
            exact List.mem_map.mpr ⟨found, List.mem_append_left _ inside, same⟩
          · intro same
            obtain ⟨found, inside, named⟩ := List.mem_map.mp stood
            have below := ops.issued state holds found inside
            rw [named, same] at below
            exact Nat.lt_irrefl _ below
      · split at ran
        · cases ran
        · split at ran
          · cases ran
          · cases ran
            exact handler_keeps ops holds stands handler _ rfl

/-- `Hooks.compensate` keeps `inv` in a scope occurrence that stands, for a run that may end as it asks. -/
theorem compensate_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled) {ctx : Ctx}
    {scope : ScopeOccurrenceId} {activity : Option ElementId} {trigger : OccurrenceRef} {leave : Option Nat}
    {resume : Option Resume} {state after : State} (holds : inv state) (stands : scope ∈ state.scopes.map (·.id))
    (resumable : ∀ next, resume = some next → (∀ occurrence leave, next = .complete occurrence leave →
      settled state occurrence) ∧ ∀ outer context, next = .group outer context → context = scope)
    (pending : ∀ element at_ resumed, resume = some (.occur element at_ resumed) →
      Laws.Step.PendingIn inv element)
    (ran : Feature.Compensation.compensate ctx scope activity trigger leave resume state = .ok after) : inv after := by
  unfold Feature.Compensation.compensate at ran
  simp only at ran
  refine ((runs_keep ops ctx _).1 _ _ _ _ ?_ ?_ ran).1
  rotate_left
  · exact stands
  refine (ops.store state _ holds (fun run member => ?_) (fun run member context running => ?_)
    (appended_resumes holds (fun _ old => old) pending)).1
  · rcases List.mem_append.mp member with old | new
    · exact .inl old
    · rw [List.mem_singleton.mp new]
      refine .inr ⟨fun occurrence leave same => (resumable _ same).1 occurrence leave rfl,
        fun outer context same => (resumable _ same).2 outer context rfl, fun _ running => ?_⟩
      simp at running
  · rcases List.mem_append.mp member with old | new
    · exact .inl ⟨run, old, running⟩
    · rw [List.mem_singleton.mp new] at running
      simp at running

/-- `Hooks.handlerCompleted` keeps `inv` for a handler whose context stands. -/
theorem handlerCompleted_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerCompleted ctx run occurrence state = .ok after) : inv after :=
  ((runs_keep ops ctx _).2.1 _ _ _ holds stands ran).1

/-- `Hooks.handlerEnded` keeps `inv` for a handler whose context stands. -/
theorem handlerEnded_keeps {inv : State → Prop} {settled : State → Nat → Prop} (ops : RunsOps inv settled)
    {ctx : Ctx} {run : ScopeOccurrenceId} {occurrence : Occurrence} {state after : State} (holds : inv state)
    (stands : occurrence.scope ∈ state.scopes.map (·.id))
    (ran : Feature.Compensation.handlerEnded ctx run occurrence state = .ok after) : inv after := by
  unfold Feature.Compensation.handlerEnded at ran
  split at ran
  · split at ran
    · exact handlerCompleted_keeps ops holds stands ran
    · cases ran
      exact holds
  all_goals cases ran
  all_goals exact holds

end Kernel.Laws.Compensation
