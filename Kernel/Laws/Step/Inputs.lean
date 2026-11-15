module

public import Kernel.Laws.Step

/-! # Laws of the step function: what a committed input is made of

The body-free consequences of `Kernel.Laws.Step`'s input equations (`step_eq`, `onRunning_eq`, `command_eq`,
`deliverEffectResult_eq`): which phases a committed input ran, what a committed command or effect result ran, and the
rejection of an input no lookup addresses. It opens no body of `Kernel.Step`; it rewrites by those equations and
composes `Kernel.Laws.Step`'s lemmas. Nothing executable imports this module.
-/

public section

namespace Kernel.Laws.Step

open Kernel Kernel.Step

/-- A committed input on a running instance ran its transition as one micro-step, from the instance's state with an
empty journal and outbox and the clock advanced to the input's time; then the closure settled, and the journal was put
in run order. -/
theorem onRunning_ok {hooks : Hooks} {ctx : Ctx} {input : Input} {before : Option State}
    {transition : State → Outcome} {after : State} (ran : onRunning hooks ctx input before transition = .ok after) :
    ∃ state start moved settled, before = some state ∧ state.status = .running ∧
      advanceClock (inputHead input).2.1 { state with journal := [], outbox := [], draft := {}, writes := [] } = .ok start ∧
      microStep hooks ctx (.input (inputHead input).1) none State.root transition start = .ok moved ∧
      settle hooks ctx closureBound closureWorkBound moved = .ok settled ∧
      after = { settled with journal := settled.journal.reverse } := by
  rw [onRunning_eq] at ran
  split at ran
  · simp at ran
  · rename_i state
    split at ran
    · simp at ran
    · rename_i running
      split at ran
      rename_i tag at? choices head
      obtain ⟨start, clocked, ran⟩ := bind_ok ran
      obtain ⟨_, _, ran⟩ := bind_ok ran
      obtain ⟨moved, stepped, ran⟩ := bind_ok ran
      obtain ⟨final, settled, made⟩ := orderJournal_ok ran
      exact ⟨state, start, moved, final, by simp, by simpa using running, by simpa [head] using clocked,
        by simpa [head] using stepped, settled, made⟩

/-- `Step.step` is a start's run, or a running input's transition and closure (`onRunning_ok`). -/
theorem step_ok {hooks : Hooks} {program : Program} {before : Option State} {input : Input} {after : State}
    (ran : step hooks program before input = .ok after) :
    (∃ payload, input = .start payload ∧ before = none ∧ StartRan hooks program payload after) ∨
      ∃ running transition, RunsTransition hooks (inputCtx hooks program input) transition ∧
        onRunning hooks (inputCtx hooks program input) running before transition = .ok after := by
  rw [step_eq] at ran
  split at ran
  · rename_i payload
    split at ran
    · simp at ran
    · left
      obtain ⟨fired, admitted, ran⟩ := bind_ok ran
      obtain ⟨start, chosen, ran⟩ := bind_ok ran
      obtain ⟨initial, clocked, ran⟩ := bind_ok ran
      obtain ⟨_, _, ran⟩ := bind_ok ran
      obtain ⟨moved, stepped, ran⟩ := bind_ok ran
      obtain ⟨final, settled, made⟩ := orderJournal_ok ran
      exact ⟨payload, by simp, by simp, ⟨start, initial, moved, final, clocked, stepped, settled, made, fired, admitted,
        chosen⟩⟩
  · exact .inr ⟨_, _, .inl ⟨_, rfl⟩, ran⟩
  · refine .inr ⟨_, _, .inr (.inr fun state after transition => ?_), ran⟩
    obtain ⟨⟨item, fired⟩, picked, fire⟩ := bind_ok transition
    exact ⟨item, fired, .inr ⟨_, picked⟩, fire⟩
  · refine .inr ⟨_, _, .inr (.inr fun state after transition => ?_), timerJob_ok ran⟩
    split at transition
    · simp at transition
    · exact ⟨_, _, .inl (Laws.Hooks.item?_mem ‹_›), transition⟩
  · obtain ⟨reported, ran⟩ := effectContinuation_ok ran
    exact .inr ⟨_, _, .inr (.inl ⟨reported, rfl⟩), ran⟩

/-! ### Inputs no lookup addresses

An addressed input whose occurrence reference no lookup finds is rejected (`step_unknown`). The lookups run on the
transition's start state, so the premise speaks of every state agreeing with the before-state on what they read. -/

/-- The fields an addressed lookup reads agree with `state`'s. -/
def Agrees (state s : State) : Prop :=
  s.occurrences = state.occurrences ∧ s.openItems = state.openItems ∧ s.scopes = state.scopes ∧
    s.instanceId = state.instanceId

theorem onRunning_rejects {hooks : Hooks} {ctx : Ctx} {input : Input} {state : State} {transition : State → Outcome}
    (rejects : ∀ s : State, Agrees state s → ∃ code, transition s = .error (.rejected code)) :
    ∃ code, onRunning hooks ctx input (some state) transition = .error (.rejected code) := by
  simp only [onRunning_eq]
  split
  · exact ⟨_, rfl⟩
  · cases clock : advanceClock (inputHead input).2.1 { state with journal := [], outbox := [], draft := {}, writes := [] } with
    | error failure =>
      obtain ⟨code, rfl⟩ := advanceClock_error clock
      exact ⟨code, by simp [bind, Except.bind]⟩
    | ok start =>
      have agrees : Agrees state start := by
        rcases advanceClock_ok clock with rfl | ⟨_, rfl⟩ <;> exact ⟨rfl, rfl, rfl, rfl⟩
      cases chose : admitChoices hooks ctx with
      | error failure =>
        obtain ⟨code, rfl⟩ := admitChoices_error chose
        exact ⟨code, by simp [bind, Except.bind]⟩
      | ok _ =>
        obtain ⟨code, rejected⟩ := rejects start agrees
        exact ⟨code, by simp [bind, Except.bind, microStep_rejected rejected]⟩

/-- An addressed input whose occurrence reference neither `occurrenceOf?` nor `itemDetail?` finds, on any state that
agrees with the before-state on what they read, is rejected. -/
theorem step_unknown {hooks : Hooks} {program : Program} {state : State} {input : Input} {ref : OccurrenceRef}
    (addressed : (∃ data : CommandInput, input = .command data ∧ data.occurrence = ref) ∨
      (∃ data : TimerInput, input = .timerFire data ∧ data.occurrence = ref) ∨
      ∃ data : EffectInput, input = .effectResult data ∧ data.occurrence = ref)
    (unknown : ∀ (ctx : Ctx) (s : State), ctx.program = program → s.occurrences = state.occurrences →
      s.openItems = state.openItems → s.scopes = state.scopes → s.instanceId = state.instanceId →
      occurrenceOf? ctx s ref = none ∧ ∀ {α : Type} (detail : WaitView → Option α), itemDetail? ctx s ref detail = none) :
    ∃ code, step hooks program (some state) input = .error (.rejected code) := by
  have lookups : ∀ s, Agrees state s → occurrenceOf? (inputCtx hooks program input) s ref = none ∧
      ∀ {α : Type} (detail : WaitView → Option α), itemDetail? (inputCtx hooks program input) s ref detail = none :=
    fun s ⟨o, i, sc, id⟩ => unknown _ s inputCtx_program o i sc id
  have itemNone : ∀ s, Agrees state s → ∀ {α : Type} (detail : WaitView → Option α),
      item? (inputCtx hooks program input) s ref detail = none := fun s agrees _ detail =>
    Laws.Hooks.item?_none ((lookups s agrees).2 detail)
  rcases addressed with ⟨data, rfl, rfl⟩ | ⟨data, rfl, rfl⟩ | ⟨data, rfl, rfl⟩
  · rw [step_eq]
    refine onRunning_rejects fun s agrees => ?_
    rw [command_eq]
    have items : ∀ {α : Type} (detail : WaitView → Option α),
        item? (inputCtx hooks program (.command data)) s data.occurrence detail = none := itemNone s agrees
    have details : ∀ {α : Type} (detail : WaitView → Option α),
        itemDetail? (inputCtx hooks program (.command data)) s data.occurrence detail = none := (lookups s agrees).2
    have occurrences := (lookups s agrees).1
    simp only [inputCtx] at items details occurrences
    cases data.action with
    | completeUserTask values => simp [items]
    | retryIncident generation => simp [details]
    | cancelIncidentProcess generation => simp [details]
    | setVariables values =>
      simp only [occurrences, SeqRight.seqRight, Except.bind]
      split
      · rename_i failure failed
        exact ⟨"value-outside-domain", by rw [Laws.Hooks.admitValues_error failed]⟩
      · simp
    | removeVariables names => simp [occurrences]
  · rw [step_eq]
    apply rejected_timerJob
    apply onRunning_rejects
    intro s agrees
    have items : ∀ {α : Type} (detail : WaitView → Option α),
        item? (inputCtx hooks program (.timerFire data)) s data.occurrence detail = none := itemNone s agrees
    simp only [inputCtx] at items
    simp [items]
  · rw [step_eq]
    apply rejected_effectContinuation
    intro reported addressed
    apply onRunning_rejects
    intro s agrees
    have items : ∀ {α : Type} (detail : WaitView → Option α),
        item? (inputCtx hooks program (.effectResult data)) s data.occurrence detail = none := itemNone s agrees
    simp only [inputCtx] at items
    simp [deliverEffectResult_eq, addressed, items]

/-- An input submitting values `admitValues` refuses, a start's variables or a variable command's values, is rejected
whatever the hooks and the before-state: the values are admitted before any hook or lookup runs. -/
theorem step_refusesValues {hooks : Hooks} {program : Program} {before : Option State} {input : Input}
    {values : List (String × Value)} {failure : Failure}
    (submits : (∃ payload : StartInput, input = .start payload ∧ payload.variables = values) ∨
      ∃ payload : CommandInput, input = .command payload ∧ payload.action = .setVariables values)
    (refused : admitValues (values.map (·.2)) = .error failure) :
    ∃ code, step hooks program before input = .error (.rejected code) := by
  have rejected := Laws.Hooks.admitValues_error refused
  subst rejected
  rcases submits with ⟨payload, rfl, rfl⟩ | ⟨payload, rfl, action⟩
  · rw [step_eq]
    cases before with
    | some _ => exact ⟨_, rfl⟩
    | none => exact ⟨"value-outside-domain", by simp [admittedStartsFired_eq, refused, SeqRight.seqRight, bind,
        Except.bind]⟩
  · rw [step_eq]
    cases before with
    | none => exact ⟨_, by dsimp only; rw [onRunning_eq]⟩
    | some state =>
      refine onRunning_rejects fun s _ => ⟨"value-outside-domain", ?_⟩
      rw [command_eq]
      simp [action, refused, SeqRight.seqRight, Except.bind]

theorem command_ok {hooks : Hooks} {ctx : Ctx} {data : CommandInput} {state after : State}
    (ran : command hooks ctx data state = .ok after) : Commands hooks ctx state after := by
  rw [command_eq] at ran
  cases action : data.action with
  | completeUserTask values =>
    simp only [action] at ran
    cases found : item? ctx state data.occurrence (·.userTask) with
    | none => simp [found] at ran
    | some item =>
      simp only [found] at ran
      split at ran
      · exact .completeUserTask (Laws.Hooks.item?_mem found) ‹_› ran
      · simp at ran
  | retryIncident generation =>
    simp only [action] at ran
    split at ran
    · simp at ran
    · exact .retryIncident (Laws.Hooks.itemDetail?_mem ‹_›) (Laws.Hooks.itemDetail?_view ‹_›) ran
  | cancelIncidentProcess generation =>
    simp only [action] at ran
    split at ran
    · simp at ran
    · exact .cancelIncidentProcess ran
  | setVariables values =>
    simp only [action] at ran
    obtain ⟨_, _, ran⟩ := bind_ok ran
    split at ran
    · simp at ran
    · exact .write (Except.ok.inj ran).symm
  | removeVariables names =>
    simp only [action] at ran
    split at ran
    · simp at ran
    · exact .remove (Except.ok.inj ran).symm

theorem deliverEffectResult_ok {hooks : Hooks} {ctx : Ctx} {data : EffectInput} {state after : State}
    (ran : deliverEffectResult hooks ctx data state = .ok after) :
    ∃ item ∈ state.openItems, item.kind.view.effect.isSome = true ∧
      hooks.effectResult ctx item data.outcome state = .ok after := by
  rw [deliverEffectResult_eq] at ran
  split at ran
  · simp at ran
  · exact ⟨_, Laws.Hooks.item?_mem ‹_›, Laws.Hooks.item?_view ‹_›, ran⟩

end Kernel.Laws.Step
