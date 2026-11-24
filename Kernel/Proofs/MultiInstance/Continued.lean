module

public import Kernel.Proofs.MultiInstance
public import Kernel.Proofs.Frame.Alongside
public import Kernel.Laws.Step.EndsFrames
public import Kernel.Laws.Step.Compacted

/-! # Proofs: Multi-Instance continuations through an input (F9)

What the state operations, `Step`'s phases, the completion pipeline and the commit keep of `Continued`: every
occurrence and queued begin continuing into a Multi-Instance body names an issued key. Each operation issues no fewer
keys (`Laws.Step.EndsStep.issued`, which removals keep too, since issuance reads no occurrence that stands) and adds no
continuation into a body but a begin's, which takes a queued request's; the Multi-Instance hooks, which queue the
instance begins, keep it in `Kernel.Proofs.MultiInstance.Formed`, beside `OccurrenceGrows` from a hook's before-state
(`grown_alongside`). The commit renames a body key onto an issued one (`Laws.Step.compact_occurrenceIssued`) and leaves
nothing queued. It reads no feature's Laws module, so it lies in no feature's rebuild cone (guard 15). Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Proofs.MultiInstance

variable {le : Issue → Issue → Bool}

open Kernel
open Kernel.Laws.State (WellFormed OccurrenceGrows Queued allSignals allQueuedTokens)
open Kernel.Proofs.Frame (FrameAlongside StoresAlongside OccursAlongside StepAlongside Alongside Unmoved)

section Continued

variable {s t : State}

/-- What `Continued` reads moves from `s` to `t`: the keys issued grow, every occurrence of `t` continuing into a body
continues as one of `s`, and every queued begin of `t` continuing into one was queued in `s`. -/
theorem Continued.move (kept : Continued s) (issued : OccurrenceGrows s t)
    (occurrences : ∀ o ∈ t.occurrences, ∀ body, o.continuation = .multiInstance body →
      ∃ old ∈ s.occurrences, old.continuation = o.continuation)
    (queued : ∀ request, Queued t request → ∀ body, request.continuation = .multiInstance body → Queued s request) :
    Continued t :=
  ⟨fun o inside body on => by
    obtain ⟨old, oldIn, same⟩ := occurrences o inside body on
    exact issued _ (kept.occurrences old oldIn body (same.trans on)),
   fun request inside body on => issued _ (kept.queued request (queued request inside body on) body on)⟩

/-- Fewer occurrences and queued entries keep `Continued`. -/
theorem Continued.shrink (kept : Continued s) (issued : OccurrenceGrows s t)
    (occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences)
    (signals : ∀ signal ∈ allSignals t, signal ∈ allSignals s)
    (tokens : ∀ token ∈ allQueuedTokens t, token ∈ allQueuedTokens s) : Continued t :=
  kept.move issued (fun o inside _ _ => ⟨o, occurrences o inside, rfl⟩) fun _ inside _ _ => inside.shrink signals tokens

theorem Continued.same (kept : Continued s) (issued : OccurrenceGrows s t) (occurrences : t.occurrences = s.occurrences)
    (signals : allSignals t = allSignals s) (tokens : allQueuedTokens t = allQueuedTokens s) : Continued t :=
  kept.shrink issued (fun _ inside => occurrences ▸ inside) (fun _ inside => signals ▸ inside)
    fun _ inside => tokens ▸ inside

/-- Queuing signals none of which begins an instance keeps `Continued`. -/
theorem Continued.signals (kept : Continued s) (more : List Signal)
    (other : ∀ request, Signal.begin request ∈ more → ∀ body, request.continuation ≠ .multiInstance body) :
    Continued { s with batchSignals := s.batchSignals ++ more } := by
  refine kept.move (fun _ issued => issued) (fun o inside _ _ => ⟨o, inside, rfl⟩) fun request inside body on => ?_
  rcases inside with signals | tokens
  · rw [Laws.State.allSignals_append] at signals
    exact (List.mem_append.mp signals).elim .inl fun new => absurd on (other request new body)
  · exact .inr tokens

/-- Queuing a signal that queues no begin (`Laws.Step.beginsOf`) keeps `Continued`. -/
theorem Continued.signal (kept : Continued s) (signal : Signal)
    (quiet : Laws.Step.beginsOf [signal] = [] := by exact rfl) : Continued (s.signal signal) := by
  rw [Laws.State.signal_eq]
  exact kept.signals [signal] fun _ new => (List.not_mem_nil (quiet ▸ Laws.Step.mem_beginsOf.mpr new)).elim

/-- Queuing tokens none of which begins an instance keeps `Continued`. -/
theorem Continued.tokens (kept : Continued s) (more : List Token)
    (other : ∀ request, Token.begin request ∈ more → ∀ body, request.continuation ≠ .multiInstance body) :
    Continued { s with batchTokens := s.batchTokens ++ more } := by
  refine kept.move (fun _ issued => issued) (fun o inside _ _ => ⟨o, inside, rfl⟩) fun request inside body on => ?_
  rcases inside with signals | tokens
  · exact .inl signals
  · rw [Laws.State.allQueuedTokens_append] at tokens
    exact (List.mem_append.mp tokens).elim .inr fun new => absurd on (other request new body)

/-- A begin queued in a state that `Unmoved` leads to was queued before. -/
theorem unmoved_queued (moved : Unmoved s t) {request : BeginRequest} (inside : Queued t request) : Queued s request := by
  rcases inside with signal | token
  · rw [allSignals, moved.queuedSignals] at signal
    rcases List.mem_append.mp signal with keyed | batch
    · exact .inl (List.mem_append_left _ keyed)
    · exact .inl (List.mem_append_right _ (Laws.Step.mem_beginsOf.mp (moved.begins ▸ Laws.Step.mem_beginsOf.mpr batch)))
  · rw [allQueuedTokens, moved.queuedTokens] at token
    rcases List.mem_append.mp token with keyed | batch
    · exact .inr (List.mem_append_left _ keyed)
    · exact .inr (List.mem_append_right _
        (Laws.Step.mem_deferredOf.mp (moved.deferred ▸ Laws.Step.mem_deferredOf.mpr batch)))

/-- A reservation keeps `Continued`: it continues by its flows. -/
theorem Continued.reserve {program : Program} (formed : WellFormed program s) (kept : Continued s) (element : ElementId)
    (scope : ScopeOccurrenceId) : Continued (s.reserve element scope).1 := by
  have reserves := Laws.State.reserve_reserves s element scope
  refine kept.move (reserves.occurrenceGrows formed.issuer) (fun o inside body on => ?_)
    fun _ inside _ _ => inside.shrink (fun _ held => reserves.signals ▸ held) fun _ held => reserves.tokens ▸ held
  rcases reserves.mem_occurrences inside with old | new
  · exact ⟨o, old, rfl⟩
  · rw [new, reserves.continued] at on
    exact (Laws.Step.flow_ne_multiInstance body on).elim

/-- Dropping a record keeps `Continued`. -/
theorem Continued.withoutRecord (kept : Continued t) (id : OccurrenceId) : Continued (Laws.State.withoutRecord t id) :=
  kept.shrink (Laws.Step.withoutRecord_frame t id).issued
    (fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1)
    (fun _ held => held) fun _ held => held

/-- A begin taken off a queue that kept `Continued` continues into an issued body, if into one. -/
theorem dequeued_issued {program : Program} {queue : State} {request : BeginRequest} (held : Continued queue)
    (dequeued : Laws.Step.Dequeued program queue request s) {body : OccurrenceId}
    (on : request.continuation = .multiInstance body) : Laws.State.OccurrenceIssued s body := by
  have queuedHere : Queued queue request := by
    rcases dequeued.queued with ⟨unit, found, _⟩ | ⟨unit, found, _⟩
    · exact .inl (List.mem_append_left _ (Laws.State.mem_values.mpr ⟨unit, found⟩))
    · exact .inr (List.mem_append_left _ (Laws.State.mem_values.mpr ⟨unit, found⟩))
  rcases dequeued.queued with ⟨_, _, popped⟩ | ⟨_, _, popped⟩ <;> subst popped <;>
    exact held.queued request queuedHere body on

theorem signal_occurrences (s : State) (signal : Signal) : (s.signal signal).occurrences = s.occurrences := by
  rw [Laws.State.signal_eq]

/-- A begin queued once a signal that queues no begin is queued was queued before. -/
theorem queued_signal {signal : Signal} {request : BeginRequest} (inside : Queued (s.signal signal) request)
    (quiet : Laws.Step.beginsOf [signal] = [] := by exact rfl) : Queued s request := by
  rw [Laws.State.signal_eq] at inside
  rcases inside with signals | tokens
  · rw [Laws.State.allSignals_append] at signals
    exact (List.mem_append.mp signals).elim .inl fun new =>
      (List.not_mem_nil (quiet ▸ Laws.Step.mem_beginsOf.mpr new)).elim
  · exact .inr tokens

/-- How a Multi-Instance hook moves what `Continued` reads from `s` to `t`: it keeps no occurrence `s` lacks, and a begin
it leaves queued that continues into a body was queued in `s` or continues into a key `t` issued, as the instance
begins it queues do (`Kernel.Proofs.MultiInstance.Formed`). -/
structure ContinuedFrame (s t : State) : Prop where
  occurrences : ∀ o ∈ t.occurrences, o ∈ s.occurrences
  queued : ∀ request, Queued t request → ∀ body, request.continuation = .multiInstance body →
    Queued s request ∨ Laws.State.OccurrenceIssued t body

/-- A hook that moves `Continued` as `ContinuedFrame` says and issues no fewer keys keeps it. -/
theorem Continued.hooked (kept : Continued s) (issued : OccurrenceGrows s t) (frame : ContinuedFrame s t) :
    Continued t :=
  ⟨fun o inside body on => issued _ (kept.occurrences o (frame.occurrences o inside) body on),
   fun request inside body on => (frame.queued request inside body on).elim
     (fun old => issued _ (kept.queued request old body on)) id⟩

/-- A fresh instance holds no occurrence and queues nothing. -/
theorem continued_initial (instanceId : String) (variables : List (String × Value)) (businessKey : Option String) :
    Continued (State.initial instanceId variables businessKey) := by
  constructor <;> simp [Queued, allSignals, allQueuedTokens, Laws.State.initial_eq, Laws.State.occurrences_eq,
    Laws.State.occurrenceList_empty]

/-! ## The state operations -/

/-- The state operations the hooks apply keep `Continued`: each issues no fewer keys, and only a begin that `BeginFits`
queues, which begins no instance. -/
theorem continued_stores (program : Program) : StoresAlongside program Continued where
  frame _ _ moved kept := kept.move (.of_same (congrArg (List.map ScopeOccurrence.id) moved.scopes) moved.scopeOrdinals
      moved.occurrenceOrdinals moved.table) (fun o inside _ _ => ⟨o, moved.occurrences ▸ inside, rfl⟩)
    fun _ inside _ _ => unmoved_queued moved inside
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept.tokens _ fun _ new => by simp at new
  complete _ _ _ _ _ _ kept := kept.signal _
  park _ _ _ _ kept := kept.same (fun _ issued => issued) rfl rfl rfl
  arm _ _ _ _ _ _ kept := kept.signal _
  armGateway _ _ _ _ _ _ _ kept := kept.signal _
  raise _ _ _ _ _ _ kept := kept.signal _
  signalBegin s request _ fits _ kept := by
    rw [Laws.State.signal_eq]
    refine kept.signals _ fun other new body => ?_
    have named : other ∈ [request] := Laws.Step.mem_beginsOf.mpr new
    rw [List.mem_singleton.mp named]
    exact fits.1 body
  takeCompletion s kept := by
    rw [Laws.State.takeCompletion_eq]
    exact kept.same (fun _ issued => issued) rfl rfl rfl
  enterScope s element _ locals owner formed stands _ kept := by
    have issued := (Laws.Step.enterScope_frame formed element stands locals owner).issued
    rw [Laws.State.enterScope_eq] at issued ⊢
    exact kept.same issued rfl rfl rfl
  reserve s element scope formed _ _ _ kept := kept.reserve formed element scope
  leaveScope le _ _ formed present _ kept :=
    have left := Laws.State.leaveScope_left (le := le) formed present
    kept.shrink (Laws.Step.leaveScope_frame formed present).issued (fun _ inside => left.occurrencesSublist.subset inside)
      (fun _ held => left.signals ▸ held) fun _ held => left.tokensSublist.subset held
  clearInside le _ _ keep formed present inside kept :=
    have cleared := Laws.State.clearInside_cleared (le := le) formed present keep
    kept.shrink (Laws.Step.clearInside_frame formed present inside).issued
      (fun _ held => cleared.occurrencesSublist.subset held) (fun _ held => cleared.signals ▸ held)
      fun _ held => cleared.tokensSublist.subset held
  disarm s host _ kept := by
    have issued := (Laws.Step.disarm_frame s host).issued
    rw [Laws.State.disarm_eq] at issued ⊢
    exact kept.shrink issued (fun _ inside => (Laws.State.mem_occurrenceList_filter_val.mp inside).1) (fun _ held => held)
      fun _ held => held
  setVariable s target name value _ kept :=
    have same := Laws.State.setVariable_same s target name value
    kept.same (Laws.Step.setVariable_frame s target name value).issued same.occurrences same.signals same.tokens
  removeVariable s target name _ kept :=
    have same := Laws.State.removeVariable_same s target name
    kept.same (Laws.Step.removeVariable_frame s target name).issued same.occurrences same.signals same.tokens
  storeRuns _ _ _ _ _ _ kept := kept.same (fun _ issued => issued) rfl rfl rfl

/-- Subscriptions' reservations, queued occurrences, compensations and raises, and a Call's entry keep `Continued`. -/
theorem continued_occursAlongside (program : Program) : OccursAlongside program Continued where
  reserve _ element scope formed _ _ _ kept := kept.reserve formed element scope
  occur _ _ _ _ _ _ _ _ _ kept := kept.signal _
  compensate _ _ _ _ _ _ _ _ _ _ _ kept := kept.signal _
  throwCompensate _ _ _ _ _ _ _ _ _ _ kept := kept.signal _
  raise _ _ _ _ _ kept := kept.signal _
  enterCalled s call variables definition formed member _ _ _ _ kept := by
    have issued := (Laws.Step.enterCalled_frame formed program (formed.owned.occurrenceScopes call member) variables
      definition).issued
    rw [Laws.State.enterCalled_eq _ _ _ _ _] at issued ⊢
    exact kept.same issued rfl rfl rfl

/-- Issuing no fewer keys from `s0` (`OccurrenceGrows`) through the state operations, the Multi-Instance ones included:
what `Kernel.Proofs.MultiInstance.Formed` reads of a Multi-Instance hook's after-state. -/
theorem grown_alongside (s0 : State) (program : Program) : Alongside program (OccurrenceGrows s0) where
  frame _ _ moved kept := kept.trans (.of_same (congrArg (List.map ScopeOccurrence.id) moved.scopes) moved.scopeOrdinals
    moved.occurrenceOrdinals moved.table)
  emit s _ _ _ _ _ kept := by
    rw [Laws.State.emit_eq]
    exact kept
  complete s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  park _ _ _ _ kept := kept
  arm s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  armGateway s _ _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  raise s _ _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  signalBegin s _ _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  takeCompletion s kept := by
    rw [Laws.State.takeCompletion_eq]
    exact kept
  enterScope s element _ locals owner formed stands _ kept :=
    kept.trans (Laws.Step.enterScope_frame formed element stands locals owner).issued
  reserve _ element _ formed stands _ _ kept := kept.trans (Laws.Step.reserve_frame formed element stands.mem).issued
  leaveScope le _ _ formed present _ kept := kept.trans (Laws.Step.leaveScope_frame formed present).issued
  clearInside le _ _ _ formed present inside kept := kept.trans (Laws.Step.clearInside_frame formed present inside).issued
  disarm s host _ kept := kept.trans (Laws.Step.disarm_frame s host).issued
  setVariable s target name value _ kept := kept.trans (Laws.Step.setVariable_frame s target name value).issued
  removeVariable s target name _ kept := kept.trans (Laws.Step.removeVariable_frame s target name).issued
  instanceBegin s _ _ _ kept := by
    rw [Laws.State.signal_eq]
    exact kept
  defer s _ _ _ kept := by
    rw [Laws.State.deferBegins_eq]
    exact kept
  leaveInstance le _ _ _ formed _ _ present kept := kept.trans (Laws.Step.leaveScope_frame formed present).issued
  runs _ _ _ _ kept := kept

/-! ## `Step`'s phases and the commit -/

/-- `Step`'s phases keep `Continued`: a begin continues as its request does, which is fresh and continues by its flows
or was taken off a queue that kept `Continued`; the commit renames every continuation into a body onto an issued key
(`Laws.Step.compact_occurrenceIssued`) and leaves nothing queued (`Laws.Step.compact_quiet`). -/
theorem continued_stepAlongside (program : Program) : StepAlongside program Continued where
  toFrameAlongside := (continued_stores program).toFrameAlongside
  journal _ _ _ _ kept _ _ _ := kept.same (fun _ issued => issued) rfl rfl rfl
  queueBatch s unit grouped _ _ kept := by
    have signals := Laws.State.allSignals_queueBatch s unit grouped
    have tokens := Laws.State.allQueuedTokens_queueBatch s unit grouped
    rw [Laws.State.queueBatch_grouped_eq] at signals tokens ⊢
    exact kept.shrink (fun _ issued => issued) (fun _ inside => inside) (fun _ held => signals.subset held)
      fun _ held => tokens.subset held
  runOrder start s log formed kept counted batches _ after made := by
    have ran := Laws.Step.orderJournal_of made
    have facts := Laws.Step.ordered_facts log formed counted batches
    have quiet := Laws.Step.compact_quiet ran ⟨facts.quietSignals, facts.quietTokens⟩
    refine ⟨fun o inside body on => ?_, fun request inside => ?_⟩
    · obtain ⟨old, oldIn, rfl⟩ := Laws.Step.compact_occurrence_eq ran inside
      obtain ⟨earlier, continued, renamed⟩ := Continuation.rekey_eq_multiInstance on
      rw [← renamed]
      exact Laws.Step.compact_occurrenceIssued ran facts.counted (Laws.Step.rooted_parents facts.rooted)
        (kept.occurrences old oldIn earlier continued)
    · rcases inside with signal | token
      · rw [quiet.1] at signal
        cases signal
      · rw [quiet.2] at token
        cases token
  dequeue s signals _ fewer kept := kept.shrink (fun _ issued => issued) (fun _ inside => inside)
    (fun _ held => (List.mem_append.mp held).elim (List.mem_append_left _) fun batch =>
      List.mem_append_right _ (fewer.subset batch)) fun _ held => held
  unqueue s unit _ kept := kept.shrink (fun _ issued => issued) (fun _ inside => inside)
    (fun _ held => (Laws.State.values_erase_fewer.append_right _).subset held) fun _ held => held
  untoken s unit _ kept := kept.shrink (fun _ issued => issued) (fun _ inside => inside) (fun _ held => held)
    fun _ held => (Laws.State.values_erase_fewer.append_right _).subset held
  begin s request role sourceType formed stands admitted _ origin kept := by
    have begins := Laws.State.beginOccurrence_begins formed.activations request role sourceType
    have issued := (Laws.Step.beginOccurrence_frame formed stands admitted role sourceType).issued
    refine ⟨fun o inside body on => ?_, fun request' inside body on => issued _ (kept.queued request'
      (inside.shrink (fun _ held => begins.signals ▸ held) fun _ held => begins.tokens ▸ held) body on)⟩
    rcases begins.mem_occurrences inside with old | new
    · exact issued _ (kept.occurrences o old body on)
    · rw [new, begins.continued] at on
      refine issued _ ?_
      rcases origin with ⟨flows, _, _⟩ | ⟨queue, held, dequeued⟩
      · exact (Laws.Step.flow_ne_multiInstance body (flows.symm.trans on)).elim
      · exact dequeued_issued held.2 dequeued on
  cancel le s id formed kept := (continued_stores program).cancelOccurrence le (fun _ id _ kept => kept.withoutRecord id)
    (fun _ _ _ kept => kept.same (fun _ issued => issued) rfl rfl rfl) (id := id) formed kept

/-- The completion pipeline's own phases keep `Continued` where they keep `WellFormed`: starting a reservation begins it
where it stands under its continuation, removing an occurrence is `FrameAlongside.removeOccurrence`, and journalling an
end moves nothing it reads. -/
theorem continued_pipelinePhases (pipeline : Laws.Step.PipelinePhases WellFormed) :
    Laws.Step.PipelinePhases fun program s => WellFormed program s ∧ Continued s where
  startReserved program s occurrence sourceType holds member unnamed := by
    refine ⟨pipeline.startReserved _ _ occurrence sourceType holds.1 member unnamed, ?_⟩
    rw [Laws.State.closeOwnItems_eq]
    suffices started : Continued (s.startReserved occurrence sourceType).1 from
      started.same (fun _ issued => issued) rfl rfl rfl
    cases begun : occurrence.begun
    · have starts := Laws.State.startReserved_starts s sourceType begun
      refine holds.2.move (Laws.Step.startReserved_frame holds.1 member sourceType).issued (fun o inside _ _ => ?_)
        fun _ inside _ _ => inside.shrink (fun _ held => starts.signals ▸ held) fun _ held => starts.tokens ▸ held
      rcases starts.mem_occurrences inside with old | rfl
      · exact ⟨o, old, rfl⟩
      · exact ⟨occurrence, member, rfl⟩
    · rw [Laws.State.startReserved_begun s sourceType begun]
      exact holds.2
  removeOccurrence program le _ occurrence holds member free :=
    have removed := pipeline.removeOccurrence _ le _ occurrence holds.1 member free
    ⟨⟨removed.1, (continued_stores program).removeOccurrence le (fun _ id _ kept => kept.withoutRecord id) holds.1 holds.2⟩,
      removed.2⟩
  recordEnd _ _ key terminal holds := ⟨pipeline.recordEnd _ _ key terminal holds.1, by
    rw [Laws.State.recordEnd_eq]
    exact holds.2.same (fun _ issued => issued) rfl rfl rfl⟩

end Continued

end Kernel.Proofs.MultiInstance
