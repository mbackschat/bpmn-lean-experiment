module

public import Kernel.Laws.Step.Keeps

/-! # Laws of the step function: what the commit takes of the closure's start

`Step.step` keeps `inv` through the commit (`step_keeps`, `running_keeps`): the closure keeps `inv` between micro-steps
(`Kernel.Laws.Step.Keeps`), and beside it a property relative to the state the closure began from (`StartKeeps`), which
`Phases.runOrder` takes, and the commit leaves a committed state (`orderJournal_committed`). It reads no body itself.
Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

variable {schedule : BranchSchedule}

open Kernel Kernel.Step

section Walk

variable {hooks : Hooks} {inv : Program → State → Prop} {base : Program → State → Prop}

/-! ## What the commit takes of the closure's start

`Phases.runOrder` compacts a settled closure against the counters of the state the closure began from, so it takes
what the closure keeps relative to that start (`CountersFrom`, DC12), with no running batch and every occurrence under
its own scope occurrence's key. A property relative to the start is carried by its own hook contract and phases, one
for every start (`StartKeeps`), through the same walk as `inv`. -/

/-- What the hooks and `Step`'s phases keep of a property `aux start` relative to the state `start` a closure began
from, for every start. -/
structure StartKeeps (hooks : Hooks) (aux : State → Program → State → Prop) : Prop where
  contract : ∀ start, HookContract hooks (aux start)
  phases : ∀ start, ClosurePhases (aux start)
  pipeline : ∀ start, PipelineKeeps hooks (aux start)

/-- A commit leaves a committed state: no transition (`orderJournal_closed`, DC4), an empty issue table (DC12) and, from
a settled closure whose occurrences do, every occurrence under its own scope occurrence's key (`orderJournal_keyed`,
DC26). -/
theorem orderJournal_committed {start settled : State} {log : RunLog} {after : State}
    (ran : orderJournal schedule start (.ok (settled, log)) = .ok after)
    (keyed : ∀ occurrence ∈ settled.occurrences, occurrence.id.scope = occurrence.scope) :
    Laws.State.Committed after := by
  refine ⟨(orderJournal_closed ran).2.2.1, ?_, ?_⟩
  · obtain ⟨_, _, _, made⟩ := orderJournal_ok ran
    rcases compact_cases made with ⟨empty, rfl⟩ | ⟨_, rfl⟩
    · exact Std.ExtTreeMap.isEmpty_iff.mp empty
    · rfl
  · exact orderJournal_keyed ran keyed

/-- `Step.step` on a running instance settles with no running batch in a state that keeps `inv` and `aux start` of the
state `start` its closure began from, which the commit orders against, when every state that keeps `inv` keeps `aux`
relative to itself, and the input's start of a committed before-state keeps `inv`. -/
theorem running_relative {aux : State → Program → State → Prop} (contract : HookContract hooks inv)
    (phases : ClosurePhases inv) (pipeline : PipelineKeeps hooks inv) (relative : StartKeeps hooks aux)
    (facts : StateFacts) (framing : Framing hooks base) (based : ∀ program s, inv program s → base program s)
    (auxBased : ∀ start program s, aux start program s → base program s)
    (entry : ∀ program s, inv program s → (∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) →
      aux s program s)
    (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit)) {program : Program} {before : State}
    {input : Input} {after : State} (committed : Laws.State.Committed before)
    (holds : inv program { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] })
    (ran : step hooks program (some before) input = .ok after) :
    ∃ (start : State) (settled : State × RunLog), (inv program settled.1 ∧ aux start program settled.1 ∧
      Unbatched settled.1) ∧ orderJournal program.options.branchSchedule start (.ok settled) = .ok after := by
  rcases step_ok ran with ⟨_, _, fresh, _⟩ | ⟨_, _, runs, ran⟩
  · simp at fresh
  · obtain ⟨state, start, moved, rest⟩ := onRunning_ok ran
    obtain ⟨settled, present, _, rest⟩ := rest
    obtain ⟨clocked, stepped, settling, made⟩ := rest
    obtain rfl := Option.some.inj present
    have entered : inv (inputCtx hooks program input).program
        { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] } := by
      rw [inputCtx_program]
      exact holds
    have started := advanceClock_keeps phases.toBodyPhases entered clocked
    have between := advanceClock_between (reset_between committed) clocked
    have keys : ∀ occurrence ∈ start.occurrences, occurrence.id.scope = occurrence.scope := by
      rcases advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact committed.keyed
    have held := input_carries contract phases facts pipeline framing based runs started between stepped settling
    have done := input_carries (relative.contract start) (relative.phases start) facts (relative.pipeline start) framing
      (auxBased start) runs (entry _ _ started keys) between stepped settling
    rw [inputCtx_program] at held done made
    exact ⟨start, settled, ⟨held.1, done.1, settle_unbatched queued (microStep_unbatched queued stepped) settling⟩,
      made⟩

/-- `Step.step` on a running instance keeps `inv` of the program it runs for hooks that keep their contract, and leaves
a committed state, when the input's start of a committed before-state keeps `inv`. An invariant relative to the
before-state may hold there though not of the before-state itself. -/
theorem running_keeps {aux : State → Program → State → Prop} (contract : HookContract hooks inv) (phases : Phases inv)
    (facts : StateFacts) (pipeline : PipelineKeeps hooks inv) (relative : StartKeeps hooks aux)
    (framing : Framing hooks base) (based : ∀ program s, inv program s → base program s)
    (auxBased : ∀ start program s, aux start program s → base program s)
    (entry : ∀ program s, inv program s → (∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) →
      aux s program s)
    (counted : ∀ start program s, aux start program s → Laws.State.CountersFrom start s)
    (keyed : ∀ start program s, aux start program s → Unbatched s →
      ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit)) {program : Program} {before : State}
    {input : Input} {after : State} (committed : Laws.State.Committed before)
    (holds : inv program { before with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] })
    (ran : step hooks program (some before) input = .ok after) : inv program after ∧ Laws.State.Committed after := by
  obtain ⟨start, settled, ⟨kept, related, unbatched⟩, made⟩ := running_relative contract phases.toClosurePhases
    pipeline relative facts framing based auxBased entry queued committed holds ran
  exact ⟨phases.runOrder _ _ _ settled.2 kept (counted _ _ _ related) unbatched (keyed _ _ _ related unbatched) _ made,
    orderJournal_committed made (keyed _ _ _ related unbatched)⟩

/-- A start's first micro-step begins its chosen start event in the process root (`StartRan`), a body every hook
contract and body phases keep, from the fresh instance with its root's Event Sub-Process starts queued for arming. -/
theorem start_body (facts : StateFacts) {program : Program} {payload : StartInput} {after : State}
    (ran : StartRan hooks program payload after) :
    ∃ (start moved : State) (settled : State × RunLog), advanceClock payload.atMs
        (((State.initial payload.instanceId payload.variables payload.businessKey).signal (.armScope State.root)).queueBatch
          (.ofRoot .seed)) = .ok start ∧
      ∃ (element : Option ElementId) (body : State → Outcome),
      (∀ (keep : Program → State → Prop), HookContract hooks keep → BodyPhases keep →
        keep (inputCtx hooks program (.start payload)).program { start with issuing := .ofRoot .input, issueNext := 0 } →
        ∀ next, body { start with issuing := .ofRoot .input, issueNext := 0 } = .ok next →
          keep (inputCtx hooks program (.start payload)).program next) ∧
      microStep hooks (inputCtx hooks program (.start payload)) (.ofRoot .input) (.input .start) element State.root body
        start = .ok moved ∧
      settle hooks (inputCtx hooks program (.start payload)) closureBound closureWorkBound (RunLog.record {} (.ofRoot .input))
        moved = .ok settled ∧ orderJournal (inputCtx hooks program (.start payload)).program.options.branchSchedule start (.ok settled) = .ok after := by
  obtain ⟨element, start, moved, rest⟩ := ran.ran
  obtain ⟨settled, clocked, stepped, rest⟩ := rest
  obtain ⟨settling, made, fired, rest⟩ := rest
  obtain ⟨admittedFired, picked⟩ := rest
  rw [admittedStartsFired_eq] at admittedFired
  have firedRoot : hooks.startsFired (inputCtx hooks program (.start payload)) payload = .ok fired := by
    cases admitting : admitValues (inputCtx hooks program (.start payload)).program.options.bounds
        (payload.variables.map (·.2)) <;>
      simp_all [SeqRight.seqRight, Except.bind]
  refine ⟨start, moved, settled, clocked, some element, _, fun _ keeps keepPhases kept _ begun => ?_, stepped, settling, made⟩
  exact begin_keeps keeps keepPhases facts kept admitted_fresh
    (.inl ⟨rfl, rfl, .inr ⟨rfl, rfl, keeps.startsFired _ _ _ firedRoot _ (Laws.Hooks.chooseStart_mem picked)⟩⟩) begun

/-- A start settles with no running batch in a state that keeps `inv` and `aux start` of the state `start` its closure
began from, which the commit orders against, when every state that keeps `inv` keeps `aux` relative to itself, from the
fresh instance with its root's Event Sub-Process starts queued for arming, when it keeps `inv`, is `Between`
micro-steps and holds every occurrence under its own scope occurrence's key. -/
theorem start_relative {aux : State → Program → State → Prop} (contract : HookContract hooks inv)
    (phases : ClosurePhases inv) (pipeline : PipelineKeeps hooks inv) (relative : StartKeeps hooks aux)
    (facts : StateFacts) (framing : Framing hooks base) (based : ∀ program s, inv program s → base program s)
    (auxBased : ∀ start program s, aux start program s → base program s)
    (entry : ∀ program s, inv program s → (∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) →
      aux s program s)
    (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit)) {program : Program}
    (initial : ∀ instanceId variables businessKey,
      inv program (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch (.ofRoot .seed)))
    (fresh : ∀ instanceId variables businessKey,
      Between (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch (.ofRoot .seed)) ∧
        ∀ occurrence ∈ (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch
          (.ofRoot .seed)).occurrences, occurrence.id.scope = occurrence.scope)
    {input : Input} {after : State} (ran : step hooks program none input = .ok after) :
    ∃ (start : State) (settled : State × RunLog), (inv program settled.1 ∧ aux start program settled.1 ∧
      Unbatched settled.1) ∧ orderJournal program.options.branchSchedule start (.ok settled) = .ok after := by
  rcases step_ok ran with ⟨payload, rfl, _, ran⟩ | ⟨_, _, _, ran⟩
  · obtain ⟨start, moved, settled, rest⟩ := start_body facts ran
    obtain ⟨clocked, _, _, rest⟩ := rest
    obtain ⟨byBody, stepped, settling, made⟩ := rest
    have queuedHolds : inv (inputCtx hooks program (.start payload)).program
        (((State.initial payload.instanceId payload.variables payload.businessKey).signal
          (.armScope State.root)).queueBatch (.ofRoot .seed)) := by
      rw [inputCtx_program]
      exact initial _ _ _
    have started := advanceClock_keeps phases.toBodyPhases queuedHolds clocked
    have between := advanceClock_between (fresh _ _ _).1 clocked
    have keys : ∀ occurrence ∈ start.occurrences, occurrence.id.scope = occurrence.scope := by
      rcases advanceClock_ok clocked with rfl | ⟨_, rfl⟩ <;> exact (fresh _ _ _).2
    have movedHolds := microStep_carries contract phases pipeline framing based started between byBody stepped
    have held := settle_carries contract phases facts pipeline framing based _ _ _ _ _ movedHolds.1 movedHolds.2 settling
    have movedAux := microStep_carries (relative.contract start) (relative.phases start) (relative.pipeline start)
      framing (auxBased start) (entry _ _ started keys) between byBody stepped
    have done := settle_carries (relative.contract start) (relative.phases start) facts (relative.pipeline start) framing
      (auxBased start) _ _ _ _ _ movedAux.1 movedAux.2 settling
    rw [inputCtx_program] at held done made
    exact ⟨start, settled, ⟨held.1, done.1, settle_unbatched queued (microStep_unbatched queued stepped) settling⟩,
      made⟩
  · obtain ⟨_, _, rest⟩ := onRunning_ok ran
    obtain ⟨_, _, present, _⟩ := rest
    simp at present

/-- `Step.step` keeps `inv` of the program it runs for hooks that keep their contract and leaves a committed state, from
a committed before-state that keeps it, or, for a start, when a fresh instance with its root's Event Sub-Process starts
queued for arming keeps it; the input's start of a committed state keeps it (`reset`). -/
theorem step_keeps {aux : State → Program → State → Prop} (contract : HookContract hooks inv) (phases : Phases inv)
    (facts : StateFacts) (pipeline : PipelineKeeps hooks inv) (relative : StartKeeps hooks aux)
    (framing : Framing hooks base) (based : ∀ program s, inv program s → base program s)
    (auxBased : ∀ start program s, aux start program s → base program s)
    (entry : ∀ program s, inv program s → (∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope) →
      aux s program s)
    (counted : ∀ start program s, aux start program s → Laws.State.CountersFrom start s)
    (keyed : ∀ start program s, aux start program s → Unbatched s →
      ∀ occurrence ∈ s.occurrences, occurrence.id.scope = occurrence.scope)
    (queued : ∀ (state : State) unit, Unbatched (state.queueBatch unit))
    (reset : ∀ program state, inv program state → Laws.State.Committed state →
      inv program { state with journal := [], intents := [], transitions := ∅, outboxes := ∅, draft := {}, writes := [] })
    {program : Program}
    (initial : ∀ instanceId variables businessKey,
      inv program ((State.initial instanceId variables businessKey).signal (.armScope State.root)))
    (fresh : ∀ instanceId variables businessKey,
      Between (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch (.ofRoot .seed)) ∧
        ∀ occurrence ∈ (((State.initial instanceId variables businessKey).signal (.armScope State.root)).queueBatch
          (.ofRoot .seed)).occurrences, occurrence.id.scope = occurrence.scope)
    {before : Option State} {input : Input} {after : State}
    (held : ∀ state, before = some state → inv program state ∧ Laws.State.Committed state)
    (ran : step hooks program before input = .ok after) : inv program after ∧ Laws.State.Committed after := by
  cases before with
  | some state =>
    exact running_keeps contract phases facts pipeline relative framing based auxBased entry counted keyed queued
      (held state rfl).2 (reset _ _ (held state rfl).1 (held state rfl).2) ran
  | none =>
    obtain ⟨start, settled, ⟨kept, related, unbatched⟩, made⟩ := start_relative contract phases.toClosurePhases pipeline
      relative facts framing based auxBased entry queued (fun _ _ _ => phases.queueBatch _ _ _ (initial _ _ _)) fresh ran
    exact ⟨phases.runOrder _ _ _ settled.2 kept (counted _ _ _ related) unbatched (keyed _ _ _ related unbatched) _ made,
      orderJournal_committed made (keyed _ _ _ related unbatched)⟩

end Walk

end Kernel.Laws.Step
