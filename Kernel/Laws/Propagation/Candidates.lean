module

public import Kernel.Hooks
public import Kernel.Laws.Propagation.Rules
import Kernel.Laws.Step.Elements
public import Kernel.Feature.Propagation.Candidates
import all Kernel.Feature.Propagation.Candidates

/-! # Laws of propagation: the catchers a level of the search offers

What `Kernel.Feature.Propagation.Candidates` offers at a level of the search, read from its bodies: the catcher
`best?` picks is a candidate that catches; a boundary `boundariesOf` lists hangs on the element and is the program's;
the Event Sub-Processes a scope occurrence offers are ones it declares; and what a compensation handler's context fires
is a non-interrupting boundary of the completed subject from a scope occurrence that declares it, while a subject that
does not enclose the handler offers nothing. `Kernel.Laws.Propagation` states the search over them. Nothing
executable imports this module.
-/

@[expose] public section

namespace Kernel.Laws.Propagation

open Kernel

/-- No candidate catches among none. -/
theorem best?_nil {α : Type} {ctx : Ctx} {raised : Raised} {trigger : α → Trigger} :
    Feature.Propagation.best? ctx raised trigger [] = none := by
  simp [Feature.Propagation.best?]

/-- The candidate `Propagation.best?` picks is one of the candidates. -/
theorem best?_mem {α : Type} {ctx : Ctx} {raised : Raised} {trigger : α → Trigger} {candidates : List α}
    {chosen : α} {writes : List (String × Value)}
    (found : Feature.Propagation.best? ctx raised trigger candidates = some (chosen, writes)) : chosen ∈ candidates := by
  unfold Feature.Propagation.best? at found
  obtain ⟨⟨caught, candidate⟩, folded, same⟩ := Option.map_eq_some_iff.mp found
  have named : candidate = chosen := congrArg Prod.fst same
  subst named
  refine Laws.State.foldl_keeps (fun chosen => ∀ pair ∈ chosen, pair.2 ∈ candidates) _ candidates none
    (fun chosen candidate inside held pair member => ?_) (by simp) _ folded
  split at member
  · exact held pair member
  · cases member
    exact inside
  · split at member
    · cases member
      exact inside
    · exact held pair member

/-- A boundary `Propagation.boundariesOf` lists lies in the envelope of the element it was asked for. -/
theorem boundariesOf_envelope {ctx : Ctx} {element : ElementId} {boundary : Boundary}
    (member : boundary ∈ Feature.Propagation.boundariesOf ctx element) :
    ∃ envelope, (ctx.program.element? element).bind (·.envelope?) = some envelope ∧ boundary ∈ envelope.boundaries := by
  unfold Feature.Propagation.boundariesOf at member
  cases found : (ctx.program.element? element).bind (·.envelope?) with
  | none => simp [found] at member
  | some envelope =>
    rw [found] at member
    exact ⟨envelope, rfl, member⟩

/-- A boundary `Propagation.boundariesOf` lists is one of the program's. -/
theorem boundariesOf_boundaryOf {ctx : Ctx} {element : ElementId} {boundary : Boundary}
    (member : boundary ∈ Feature.Propagation.boundariesOf ctx element) : Laws.IL.BoundaryOf ctx.program boundary.id :=
  let ⟨_, found, inside⟩ := boundariesOf_envelope member
  Laws.IL.boundaryOf_envelope found inside

/-- A boundary `Propagation.boundariesOf` lists hangs on the element it was asked for and lists its own outgoing
flows. -/
theorem boundariesOf_sourced {ctx : Ctx} {element : ElementId} {boundary : Boundary}
    (member : boundary ∈ Feature.Propagation.boundariesOf ctx element) :
    Laws.Flow.Linked ctx.program element boundary.id ∧
      ∀ flow ∈ boundary.outgoing, Laws.Flow.Lists ctx.program boundary.id flow := by
  obtain ⟨envelope, found, member⟩ := boundariesOf_envelope member
  obtain ⟨host, located, has⟩ := Option.bind_eq_some_iff.mp found
  exact ⟨.inr (.inr (.inr (.inl ⟨host, envelope, located, has, boundary, member, rfl⟩))),
    fun _ inside => .inr ⟨host, Laws.IL.element?_mem located, envelope, has, boundary, member, rfl, inside⟩⟩

/-- The candidate `Propagation.best?` picks catches the event. -/
theorem best?_catches {α : Type} {ctx : Ctx} {raised : Raised} {trigger : α → Trigger} {candidates : List α}
    {chosen : α} {writes : List (String × Value)}
    (found : Feature.Propagation.best? ctx raised trigger candidates = some (chosen, writes)) :
    (ctx.catches raised (trigger chosen)).isSome := by
  unfold Feature.Propagation.best? at found
  obtain ⟨⟨caught, candidate⟩, folded, same⟩ := Option.map_eq_some_iff.mp found
  have named : candidate = chosen := congrArg Prod.fst same
  subst named
  have kept : ctx.catches raised (trigger candidate) = some caught := by
    refine Laws.State.foldl_keeps (fun chosen => ∀ pair ∈ chosen, ctx.catches raised (trigger pair.2) = some pair.1) _
      candidates none (fun chosen candidate _ held pair member => ?_) (by simp) _ folded
    split at member
    · exact held pair member
    · cases member
      assumption
    · split at member
      · cases member
        assumption
      · exact held pair member
  simp [kept]

/-- An Event Sub-Process `Propagation.eventSubProcesses` offers is a child the scope occurrence declares, started by
the subscription `Ctx.eventStart` reads of it, under its own identifier. -/
theorem eventSubProcesses_mem {ctx : Ctx} {state : State} {occurrence : ScopeOccurrence}
    {handler : ElementId × Subscription × Bool}
    (member : handler ∈ Feature.Propagation.eventSubProcesses ctx state occurrence) :
    ∃ child ∈ state.childrenOf ctx.program occurrence.id, ∃ header payload, child.scope? = some (header, payload) ∧
      ctx.eventStart payload = some (handler.2.1, handler.2.2) ∧ header.id = handler.1 := by
  unfold Feature.Propagation.eventSubProcesses Feature.Propagation.startsOf at member
  obtain ⟨child, inside, made⟩ := List.mem_filterMap.mp member
  obtain ⟨⟨header, payload⟩, isScope, made⟩ := Option.bind_eq_some_iff.mp made
  obtain ⟨⟨start, interrupting⟩, started, same⟩ := Option.map_eq_some_iff.mp made
  cases same
  exact ⟨child, inside, header, payload, isScope, started, rfl⟩

/-- The candidates `Propagation.handlerCandidates` offers are Event Sub-Processes the scope occurrence declares. -/
theorem handlerCandidates_mem {ctx : Ctx} {raised : Raised} {origin : Origin} {state : State}
    {occurrence : ScopeOccurrence} {handlers : List (ElementId × Subscription × Bool)}
    (offered : Feature.Propagation.handlerCandidates ctx raised origin state occurrence = .ok handlers) :
    ∀ handler ∈ handlers, handler ∈ Feature.Propagation.eventSubProcesses ctx state occurrence := by
  unfold Feature.Propagation.handlerCandidates at offered
  dsimp only at offered
  split at offered
  · cases offered
    intro _ member
    cases member
  · split at offered
    · cases offered
      exact fun _ => id
    · split at offered
      · simp at offered
      · split at offered
        · simp at offered
        · cases offered
          exact fun _ member => (List.mem_filter.mp member).1

/-- Right after a compensation handler's context the search offers every Event Sub-Process the scope occurrence
declares (`Propagation.jumpCandidates`). -/
theorem jumpCandidates_eq {ctx : Ctx} {raised : Raised} {state : State} {occurrence : ScopeOccurrence}
    {handlers : List (ElementId × Subscription × Bool)}
    (offered : Feature.Propagation.jumpCandidates ctx raised state occurrence = .ok handlers) :
    handlers = Feature.Propagation.eventSubProcesses ctx state occurrence := by
  unfold Feature.Propagation.jumpCandidates at offered
  dsimp only at offered
  split at offered
  · simp at offered
  · cases offered
    rfl

/-- The candidates an ordinary scope occurrence offers (`Propagation.levelCandidates`) are Event Sub-Processes it
declares. -/
theorem levelCandidates_mem {ctx : Ctx} {raised : Raised} {origin : Origin} {state : State}
    {occurrence : ScopeOccurrence} {jumped : Option (Option ElementId)}
    {handlers : List (ElementId × Subscription × Bool)}
    (offered : Feature.Propagation.levelCandidates ctx raised origin state occurrence jumped = .ok handlers) :
    ∀ handler ∈ handlers, handler ∈ Feature.Propagation.eventSubProcesses ctx state occurrence := by
  cases jumped with
  | none => exact handlerCandidates_mem offered
  | some _ =>
    rw [jumpCandidates_eq offered]
    exact fun _ => id

/-- The Event Sub-Processes a search's candidates at an ordinary scope occurrence name are ones it declares
(`Feature.Propagation.eventSubProcesses`). -/
theorem levelCandidates_children {ctx : Ctx} {raised : Raised} {origin : Origin} {state : State}
    {occurrence : ScopeOccurrence} {jumped : Option (Option ElementId)}
    {handlers : List (ElementId × Subscription × Bool)}
    (ran : Feature.Propagation.levelCandidates ctx raised origin state occurrence jumped = .ok handlers) :
    ∀ handler ∈ handlers, ∃ child ∈ state.childrenOf ctx.program occurrence.id, child.header.id = handler.1 :=
  fun handler member => by
    obtain ⟨child, inside, header, rest⟩ := eventSubProcesses_mem (levelCandidates_mem ran handler member)
    obtain ⟨_, scoped_, -, named⟩ := rest
    exact ⟨child, inside, by rw [Laws.Step.scope?_header scoped_]; exact named⟩

/-- The boundaries a compensation handler's context offers are the compensated subject's. -/
theorem contextCandidates_boundaries {ctx : Ctx} {state : State} {record : Compensable} {raising : Option ElementId}
    {boundary : Boundary} (member : boundary ∈ (Feature.Propagation.contextCandidates ctx state record raising).2) :
    boundary ∈ Feature.Propagation.boundariesOf ctx record.subject := by
  unfold Feature.Propagation.contextCandidates at member
  dsimp only at member
  split at member
  · exact member
  · simp at member

/-- What a compensation handler's context fires (`Propagation.contextCatcher`): one of the compensated subject's
boundaries, neither interrupting nor catching a Cancel, from a scope occurrence that stands and declares the subject. -/
theorem contextCatcher_some {ctx : Ctx} {raised : Raised} {state : State} {record : Compensable}
    {raising : Option ElementId} {boundary : Boundary}
    (found : Feature.Propagation.contextCatcher ctx raised state record raising = .ok (some boundary)) :
    boundary ∈ Feature.Propagation.boundariesOf ctx record.subject ∧ boundary.interrupting = false ∧
      raised.isCancel = false ∧ (∃ entry ∈ state.scopes, entry.id = record.scope) ∧
      ∃ child ∈ state.childrenOf ctx.program record.scope, child.header.id = record.subject := by
  unfold Feature.Propagation.contextCatcher at found
  dsimp only at found
  split at found
  · simp at found
  · split at found
    · simp at found
    · rename_i chosen writes bounded
      have inside := contextCandidates_boundaries (best?_mem bounded)
      split at found
      · simp at found
      · rename_i interrupts
        split at found
        · simp at found
        · split at found
          · simp at found
          · rename_i placed
            cases found
            simp only [Bool.or_eq_true, not_or, Bool.not_eq_true] at interrupts
            simp only [Bool.not_eq_true', Bool.not_eq_false, Bool.and_eq_true, List.any_eq_true, beq_iff_eq]
              at placed
            obtain ⟨⟨entry, entryIn, named⟩, child, childIn, childNamed⟩ := placed
            exact ⟨inside, interrupts.1, interrupts.2, ⟨entry, entryIn, named⟩, child, childIn, childNamed⟩

/-- A compensation handler's context offers nothing of a subject that does not enclose the handler the raise runs in,
`raising` (R1 of the #159 review): the search goes on from the scope occurrence holding the record. -/
theorem contextCatcher_unenclosed {ctx : Ctx} {raised : Raised} {state : State} {record : Compensable}
    {raising : Option ElementId}
    (apart : raising.any (Feature.Propagation.within ctx record.subject (ctx.program.elements.length + 1)) = false) :
    Feature.Propagation.contextCatcher ctx raised state record raising = .ok none := by
  simp [Feature.Propagation.contextCatcher, Feature.Propagation.contextCandidates, apart, Feature.Propagation.best?]

end Kernel.Laws.Propagation
