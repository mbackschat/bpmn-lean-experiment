module

public import Kernel.Proofs.Former.PlacedSources
public import Kernel.Laws.Step.CompactedKeys

/-! # Placement across compaction at commit (DC12)

`Placing` and `PlacedLane` across `Step.orderJournal`'s compaction (`Proofs.Frame.StepAlongside.runOrder`).

A commit renames every scope occurrence with its instance root (`Laws.Step.compact_instanceIn`), so an element placed
where a standing scope occurrence lies is placed where its renamed key lies; it keeps every element, flow, leave and
record kind, and leaves nothing queued, so every clause over queued work holds of nothing. The scope occurrences the
lane reads only while they stand were issued (`PlacedLane.issued`), and a renamed issued key stands only where it stood
(`Laws.Step.renameScope_apart`). Instance roots are kept apart only if they stand (`RootsStanding`), the premise the
lane does not carry.
-/

@[expose] public section

namespace Kernel.Proofs.Former

variable {schedule : BranchSchedule}

open Kernel Kernel.Step Kernel.Laws.State Kernel.Laws.Step
open Kernel.Laws.Compensation (recordElements)

section Compacts

variable {start : State} {log : RunLog} {s t : State}

/-- The instance entries a commit leaves: the settled state's, their roots renamed. -/
theorem compact_instances (ran : compact schedule start log s = .ok t) :
    t.slots.instances = s.slots.instances.map fun data => { data with root := renameScope (commitRenaming schedule start log s) data.root } := by
  rw [compact_slots ran, renameSlots_eq]

/-- The join waits a commit leaves: the settled state's, renamed. -/
theorem compact_parked (ran : compact schedule start log s = .ok t) :
    t.slots.parked = s.slots.parked.map fun parked => { parked with
      occurrence := renameId (commitRenaming schedule start log s) parked.occurrence
      scope := renameScope (commitRenaming schedule start log s) parked.scope } := by
  rw [compact_slots ran, renameSlots_eq]

/-- An issued key's parent was issued. -/
theorem issued_parent {x p : ScopeOccurrenceId} (issued : ScopeIssued s x) (link : x.parent? = some p) :
    ScopeIssued s p := by
  obtain ⟨segment, segments⟩ := ScopeOccurrenceId.parent?_eq_some.mp link
  have parent := (show ScopeIssued s (.ofSegments (segment :: p.segments)) by
    rw [← segments, ScopeOccurrenceId.ofSegments_eta]; exact issued).parent
  rwa [ScopeOccurrenceId.ofSegments_eta] at parent

/-- An issued key the commit renames onto a standing one stood. -/
theorem compact_present (ran : compact schedule start log s = .ok t) (counted : CountersFrom start s) (rooted : Rooted s)
    {x : ScopeOccurrenceId} (issued : ScopeIssued s x) (present : renameScope (commitRenaming schedule start log s) x ∈ scopeIds t) :
    x ∈ scopeIds s := by
  rw [scopeIds, ← standingKeys, compact_scopes ran] at present
  obtain ⟨y, standing, same⟩ := List.mem_map.mp present
  rw [renameScope_apart counted rooted issued standing same.symm]
  exact standing

/-- A standing scope occurrence stands, renamed, after the commit. -/
theorem compact_standing (ran : compact schedule start log s = .ok t) {x : ScopeOccurrenceId} (present : x ∈ scopeIds s) :
    renameScope (commitRenaming schedule start log s) x ∈ scopeIds t := by
  rw [scopeIds, ← standingKeys, compact_scopes ran]
  exact List.mem_map_of_mem present

end Compacts

/-- A commit's renaming keeps the root an instance chain ends at, renamed. -/
theorem chainRoot_renamed {start s : State} {log : RunLog} (rooted : Rooted s) (chain : List ScopeOccurrence) :
    chainRoot (chain.map (renamedScope (commitRenaming schedule start log s))) =
      renameScope (commitRenaming schedule start log s) (chainRoot chain) := by
  unfold chainRoot
  rw [List.getLast?_map]
  rcases chain.getLast? with _ | last
  · exact (renameScope_root rooted (renameBy_fixes _)).symm
  · by_cases called : last.calledInstance.isSome = true
    · simp [called]
    · simp [called, renameScope_root rooted (renameBy_fixes _)]

section Placing

variable {program : Program} {start state : State} {log : RunLog} {after : State}

/-- **A standing scope occurrence keeps its instance root across the commit**, renamed, and that root stands. -/
theorem orderJournal_instanceRoot (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) {x : ScopeOccurrenceId} (present : x ∈ scopeIds state) :
    after.instanceRoot (renameScope (commitRenaming schedule start log (ordered log state)) x) =
        renameScope (commitRenaming schedule start log (ordered log state)) (state.instanceRoot x) ∧
      state.instanceRoot x ∈ scopeIds state := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have rooted := facts.rooted
  obtain ⟨name, chain, reading, -⟩ := instanceIn_exists formed present
  have reading' : InstanceIn (ordered log state) x name chain := reading.transport (fun entry inside => reading.mem entry inside) rfl
  have renamed := compact_instanceIn ran counted' issued rooted formed.distinct.scopes reading'
  have distinct := compact_scopesNodup ran formed.distinct.scopes
  have before := instanceRoot_chain reading formed.distinct.scopes reading.mem
  refine ⟨?_, ?_⟩
  · rw [instanceRoot_chain renamed distinct renamed.mem, before, chainRoot_renamed rooted]
  · rw [before]
    unfold chainRoot
    rcases last : chain.getLast? with _ | last'
    · exact formed.rooted.1
    · by_cases called : last'.calledInstance.isSome = true
      · simp only [called, ↓reduceIte]
        exact List.mem_map_of_mem (reading.mem last' (List.mem_of_getLast? last))
      · simp only [called, Bool.false_eq_true, ↓reduceIte]
        exact formed.rooted.1

/-- **Placement where a standing scope occurrence lies moves to its renamed key across the commit.** -/
theorem orderJournal_placedIn (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (rootsIssued : ∀ entry ∈ state.slots.instances, ScopeIssued state entry.root)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) {element : ElementId} {x : ScopeOccurrenceId}
    (placed : PlacedIn program state element x) (present : x ∈ scopeIds state) :
    PlacedIn program after element (renameScope (commitRenaming schedule start log (ordered log state)) x) := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have rooted := facts.rooted
  obtain ⟨root, standing⟩ := orderJournal_instanceRoot formed counted batches made present
  intro entry member same
  rw [compact_instances ran] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  rw [root] at same
  have apart := renameScope_apart counted' rooted (rootsIssued old inside) standing same
  exact placed old inside apart

/-- **`RootsStanding` across the commit.** -/
theorem orderJournal_rootsStanding (standing : RootsStanding state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : RootsStanding after := by
  have ran := orderJournal_of made
  intro entry member
  rw [compact_instances ran] at member
  obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
  exact compact_standing ran (standing old inside)

/-- A renamed compensation resume is a resume of the same kind. -/
theorem resume_renamed {r : Issue → Issue} {resume : Option Resume} {renamed : Resume}
    (same : resume.map (renameResume r) = some renamed) : ∃ old, resume = some old ∧ renameResume r old = renamed := by
  rcases resume with _ | old
  · cases same
  · exact ⟨old, rfl, Option.some.inj same⟩

/-- **`PlacedLane` across the commit** (`Placing`'s `runOrder`, every field of `PlacedCore` and `PlacedLane`):
`PlacedCore.rootsApart` reads `PlacedLane.rootsStanding`. -/
theorem orderJournal_placedLane (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (held : PlacedLane program state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : PlacedLane program after := by
  have ran := orderJournal_of made
  have facts := ordered_facts log formed counted batches
  have counted' := facts.counted
  have issued := facts.issued
  have owned := facts.owned
  have rooted := facts.rooted
  have quietSignals := facts.quietSignals
  have quietTokens := facts.quietTokens
  have quiet := compact_quiet ran ⟨quietSignals, quietTokens⟩
  have fixes : Fixes (commitRenaming schedule start log (ordered log state)) := renameBy_fixes _
  have historic := historic_of issued rooted
  have place : ∀ {element x}, PlacedIn program state element x → x ∈ scopeIds state →
      PlacedIn program after element (renameScope (commitRenaming schedule start log (ordered log state)) x) :=
    fun placed present => orderJournal_placedIn formed counted batches held.rootsIssued made placed present
  have present : ∀ {x}, ScopeIssued state x →
      renameScope (commitRenaming schedule start log (ordered log state)) x ∈ scopeIds after → x ∈ scopeIds state :=
    fun issuedX inside => compact_present ran counted' rooted issuedX inside
  have resumes : Laws.Step.resumesOf (allSignals after) = [] := by rw [quiet.1]; rfl
  -- A renamed occurrence carrying a join wait's renamed number is the wait's.
  have waiting : ∀ w ∈ state.slots.parked, ∀ old ∈ state.occurrences,
      renameId (commitRenaming schedule start log (ordered log state)) old.id =
        renameId (commitRenaming schedule start log (ordered log state)) w.occurrence → old.id = w.occurrence :=
    fun w wIn old oldIn same =>
      (renamed_apart counted' issued owned rooted keys (formed.settled.parked w wIn).1 oldIn same.symm).symm
  have retainedEq := compact_retained ran
  refine {
    placed := ⟨?rooted, ?entered, ?occurrences⟩
    rootsApart := ?rootsApart, rootsIssued := ?rootsIssued, rootDefinition := ?rootDefinition, scopes := ?scopes
    incoming := ?incoming, parked := ?parked, resumes := ?resumes, tokens := ?tokens, begins := ?begins
    occurs := ?occurs, arms := ?arms, gateways := ?gateways, completes := ?completes, compensates := ?compensates
    records := ?records, pending := ?pending, calledApart := ?calledApart, rootBare := ?rootBare, runs := ?runs
    raises := ?raises, issued := ?issued, waits := ?waits
    rootsStanding := orderJournal_rootsStanding held.rootsStanding made }
  case rooted =>
    obtain ⟨entry, inside, root⟩ := held.placed.rooted
    refine ⟨_, by rw [compact_instances ran]; exact List.mem_map_of_mem inside, ?_⟩
    simp only [root]
    exact renameScope_root rooted fixes
  case entered =>
    intro root member called
    obtain ⟨old, inside, rfl⟩ := compact_scope_eq ran member
    obtain ⟨entry, entryIn, same⟩ := held.placed.entered old inside called
    refine ⟨_, by rw [compact_instances ran]; exact List.mem_map_of_mem entryIn, ?_⟩
    simp [same]
  case occurrences =>
    intro o member entry entryIn root
    obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran member
    exact place (held.placed.occurrences old oldIn) (formed.owned.occurrenceScopes old oldIn) entry entryIn root
  case rootsApart =>
    rw [compact_instances ran, List.map_map]
    have nodup := held.rootsApart
    unfold List.Nodup at nodup ⊢
    rw [List.pairwise_map] at nodup ⊢
    refine nodup.imp_of_mem fun {a b} _ bIn apart same => apart ?_
    exact renameScope_apart counted' rooted (held.rootsIssued a ‹_›) (held.rootsStanding b bIn) same
  case rootsIssued =>
    intro entry member
    rw [compact_instances ran] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    exact compact_scopeIssued ran counted' rooted (held.rootsIssued old inside)
  case rootDefinition =>
    intro entry member
    rw [compact_instances ran] at member
    obtain ⟨old, inside, rfl⟩ := List.mem_map.mp member
    rw [← held.rootDefinition old inside]
    exact renamed_root rooted fixes (ScopeIssued.layered (held.rootsIssued old inside))
  case scopes =>
    intro entry member element parent named link standing
    obtain ⟨old, inside, rfl⟩ := compact_scope_eq ran member
    simp only [ScopeOccurrence.parent_eq] at link
    rw [renamed_parent fixes (ScopeIssued.layered (historic.issued inside))] at link
    obtain ⟨p, oldLink, rfl⟩ := Option.map_eq_some_iff.mp link
    have pIssued := issued_parent (historic.issued inside) oldLink
    have pPresent := present pIssued standing
    exact place (held.scopes old inside element p named (by simpa using oldLink) pPresent) pPresent
  case incoming =>
    intro o member flow target incoming targeted
    obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran member
    exact held.incoming old oldIn flow target incoming targeted
  case parked =>
    intro w member o oMember same target targeted
    rw [compact_parked ran] at member
    obtain ⟨w, wIn, rfl⟩ := List.mem_map.mp member
    obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran oMember
    have link := waiting w wIn old oldIn same
    exact place (held.parked w wIn old oldIn link target targeted) (formed.owned.occurrenceScopes old oldIn)
  case resumes =>
    intro run member id leave resumed
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    obtain ⟨old, was, renamed⟩ := resume_renamed resumed
    rcases old with ⟨i, l⟩ | ⟨_, _, _⟩ | _ <;> simp at renamed
    exact renamed.2 ▸ held.resumes run runIn i l was
  case tokens => intro _ _ _ queued; rw [quiet.2] at queued; cases queued
  case begins => intro request queued; exact absurd queued (quiet_queued quiet)
  case occurs =>
    rintro element scope leave (⟨_, _, signal⟩ | resumed | ⟨run, member, resumed⟩)
    · rw [quiet.1] at signal; cases signal
    · rw [resumes] at resumed; cases resumed
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    obtain ⟨old, was, renamed⟩ := resume_renamed resumed
    rcases old with ⟨_, _⟩ | ⟨element', scope', leave'⟩ | _ <;> simp at renamed
    obtain ⟨rfl, rfl, rfl⟩ := renamed
    have at' : OccurAt state element' scope' leave' := .inr (.inr ⟨run, runIn, was⟩)
    obtain ⟨placed, flows⟩ := held.occurs element' scope' leave' at'
    have scopeIssued := held.issued scope' (.inl ⟨element', leave', at'⟩)
    exact ⟨fun inside => place (placed (present scopeIssued inside)) (present scopeIssued inside), flows⟩
  case arms => intro _ _ _ signal; rw [quiet.1] at signal; cases signal
  case gateways => intro _ _ _ signal; rw [quiet.1] at signal; cases signal
  case completes => intro _ _ _ _ signal; rw [quiet.1] at signal; cases signal
  case compensates => intro _ _ resumed; rw [resumes] at resumed; cases resumed
  case raises => intro _ _ signal; rw [quiet.1] at signal; cases signal
  case records =>
    intro record member standing element named
    rw [retainedEq] at member
    obtain ⟨y, yIn, rfl⟩ := List.mem_map.mp member
    rw [renameCompensable_eq] at standing named ⊢
    have yPresent := present (held.issued y.scope (.inr (.inr (.inl ⟨y, yIn, rfl⟩)))) standing
    exact place (held.records y yIn yPresent element (by simpa [recordElements] using named)) yPresent
  case pending =>
    intro run member standing record recordIn element named
    obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
    obtain ⟨x, xIn, rfl⟩ := List.mem_map.mp recordIn
    rw [renameCompensable_eq] at named
    have runPresent := present
      (held.issued run.scope (.inr (.inr (.inr (.inl ⟨run, runIn, rfl, List.ne_nil_of_mem xIn⟩))))) standing
    exact place (held.pending run runIn runPresent x xIn element (by simpa [recordElements] using named)) runPresent
  case calledApart =>
    intro entry member called
    obtain ⟨old, inside, rfl⟩ := compact_scope_eq ran member
    obtain ⟨elements, owners⟩ := held.calledApart old inside called
    refine ⟨elements, fun owner ownerIn link => ?_⟩
    obtain ⟨o, oIn, rfl⟩ := compact_occurrence_eq ran ownerIn
    obtain ⟨a, was, same⟩ := Option.map_eq_some_iff.mp link
    obtain ⟨holder, holderIn, named, -⟩ := formed.owned.scopeOwners old inside a was
    have apart := renamed_apart counted' issued owned rooted keys (named ▸ issued.occurrences holder holderIn) oIn same
    exact owners o oIn (by rw [was, apart])
  case rootBare =>
    intro entry member
    obtain ⟨old, inside, rfl⟩ := compact_scope_eq ran member
    have bare := held.rootBare old inside
    simp only [ScopeOccurrence.parent_eq] at bare ⊢
    rw [renamed_parent fixes (ScopeIssued.layered (historic.issued inside))]
    simpa using bare
  case runs =>
    intro run member standing
    obtain ⟨run, runIn, rfl⟩ := compact_bodies ran member
    have runPresent := present (held.issued run.scope (.inr (.inr (.inr (.inr ⟨run, runIn, rfl⟩))))) standing
    exact place (held.runs run runIn runPresent) runPresent
  case issued =>
    rintro x (⟨element, leave, at'⟩ | ⟨_, _, signal, -⟩ | ⟨record, member, rfl⟩ | ⟨run, member, rfl, pending⟩ |
      ⟨run, member, rfl⟩)
    · rcases at' with ⟨_, _, signal⟩ | resumed | ⟨run, member, resumed⟩
      · rw [quiet.1] at signal; cases signal
      · rw [resumes] at resumed; cases resumed
      obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
      obtain ⟨old, was, renamed⟩ := resume_renamed resumed
      rcases old with ⟨_, _⟩ | ⟨element', scope', leave'⟩ | _ <;> simp at renamed
      obtain ⟨rfl, rfl, rfl⟩ := renamed
      exact compact_scopeIssued ran counted' rooted (held.issued scope' (.inl ⟨element', leave', .inr (.inr ⟨run, runIn, was⟩)⟩))
    · rw [quiet.1] at signal; cases signal
    · rw [retainedEq] at member
      obtain ⟨y, yIn, rfl⟩ := List.mem_map.mp member
      rw [renameCompensable_eq]
      exact compact_scopeIssued ran counted' rooted (held.issued y.scope (.inr (.inr (.inl ⟨y, yIn, rfl⟩))))
    · obtain ⟨run, runIn, rfl⟩ := compact_runs_of ran member
      exact compact_scopeIssued ran counted' rooted
        (held.issued run.scope (.inr (.inr (.inr (.inl ⟨run, runIn, rfl, by simpa using pending⟩)))))
    · obtain ⟨run, runIn, rfl⟩ := compact_bodies ran member
      exact compact_scopeIssued ran counted' rooted (held.issued run.scope (.inr (.inr (.inr (.inr ⟨run, runIn, rfl⟩)))))
  case waits =>
    intro w member o oMember same
    rw [compact_parked ran] at member
    obtain ⟨w, wIn, rfl⟩ := List.mem_map.mp member
    obtain ⟨old, oldIn, rfl⟩ := compact_occurrence_eq ran oMember
    have link := waiting w wIn old oldIn same
    simp only [held.waits w wIn old oldIn link]

/-- **`Placing` across the commit** (`Placing`'s `runOrder`). -/
theorem orderJournal_placing (formed : WellFormed program state) (counted : CountersFrom start state)
    (batches : state.batchSignals = [] ∧ state.batchTokens = [] ∧ state.batchIntents = [])
    (keys : ∀ occurrence ∈ state.occurrences, occurrence.id.scope = occurrence.scope)
    (held : Placing program state)
    (made : orderJournal schedule start (.ok (state, log)) = .ok after) : Placing program after := fun references =>
  orderJournal_placedLane formed counted batches keys (held references) made

end Placing

end Kernel.Proofs.Former
