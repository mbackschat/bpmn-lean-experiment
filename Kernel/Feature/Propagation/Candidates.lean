module

public import Kernel.Hooks

/-! # Propagation: the catchers a level of the search offers

What `Kernel.Feature.Propagation`'s search for a catcher offers at each of its levels, and the refusals that rest on
where a raise runs: the catcher with the lowest precedence among a level's candidates (`best?`); the boundaries on an
element; the Event Sub-Processes of a scope occurrence, which a raise passes when it originates inside them
(`handlerCandidates`) and which a search reaching the scope occurrence holding a compensated subject's record offers
whole (`jumpCandidates`); and what a compensation handler's context offers of its completed subject
(`contextCatcher`). Everything here reads the program and the state and changes nothing; where the search decides and
what a catch does is the search's.
-/

public section

namespace Kernel.Feature.Propagation

/-- The catcher with the lowest precedence among `candidates`, the first in document order on a tie, with what it
writes. -/
def best? {α : Type} (ctx : Ctx) (raised : Raised) (trigger : α → Trigger) (candidates : List α) :
    Option (α × List (String × Value)) :=
  (candidates.foldl (fun chosen candidate =>
    match ctx.catches raised (trigger candidate), chosen with
    | none, _ => chosen
    | some caught, none => some (caught, candidate)
    | some caught, some (best, _) => if caught.rank < best.rank then some (caught, candidate) else chosen) none).map
    fun (caught, candidate) => (candidate, caught.writes)

def boundariesOf (ctx : Ctx) (element : ElementId) : List Boundary :=
  (((ctx.program.element? element).bind (·.envelope?)).map (·.boundaries)).getD []

/-- The Event Sub-Processes among `children`, each with its start and whether it interrupts. -/
def startsOf (ctx : Ctx) (children : List Element) : List (ElementId × Subscription × Bool) :=
  children.filterMap fun child =>
    child.scope?.bind fun (header, payload) => (ctx.eventStart payload).map fun (start, interrupting) =>
      (header.id, start, interrupting)

/-- The Event Sub-Processes declared directly in `occurrence`, the process included, each with its start and whether it
interrupts; a called root's are its called process's (`State.childrenOf`). -/
def eventSubProcesses (ctx : Ctx) (state : State) (occurrence : ScopeOccurrence) : List (ElementId × Subscription × Bool) :=
  startsOf ctx (state.childrenOf ctx.program occurrence.id)

/-- Whether `inner` is `outer` or declared inside it at any depth of the model; `fuel` bounds the walk by the number of
elements. -/
def within (ctx : Ctx) (outer : ElementId) : Nat → ElementId → Bool
  | 0, _ => false
  | fuel + 1, inner => inner == outer || ((ctx.program.element? inner).bind (·.header.parent)).any (within ctx outer fuel)

/-- Whether the search passes the Event Sub-Process a raise originates in however deep inside it the raise runs, or
only when it runs directly in it. CIB's Error finder skips an ancestor flow scope at any depth
(`bpmn/helper/ErrorDeclarationForProcessInstanceFinder.java:41-58`, `pvm/process/ScopeImpl.java:170-182`), its
Escalation finder only the thrower's direct flow scope (`bpmn/helper/EscalationEventDefinitionFinder.java:58-61`). No
Event Sub-Process catches a Cancel (`start.cancel`), so its answer is never read. -/
def passesHandlerAtAnyDepth : Raised → Bool
  | .error _ _ => true
  | .escalation _ => false
  | .cancel => true

/-- The scope occurrence held directly in `visited` that the chain from `current` outward passes through, if any;
`fuel` bounds the walk by the number of scope occurrences. -/
def heldOnChain (state : State) (visited : ScopeOccurrenceId) : Nat → ScopeOccurrenceId → Option ScopeOccurrence
  | 0, _ => none
  | fuel + 1, current =>
    (state.scopes.find? (·.id == current)).bind fun occurrence =>
      if occurrence.parent == some visited then some occurrence
      else occurrence.parent.bind (heldOnChain state visited fuel)

/-- Whether `occurrence` only wraps `held`, the scope occurrence directly inside it on the raise's chain, of its own
element: a Multi-Instance body's scope occurrence around an instance's, an instance's around the Sub-Process instance's,
or a compensation handler's context around the handler Sub-Process's. Its element's Event Sub-Processes belong to the
innermost one, the Sub-Process instance, whose `Scopes.enter` armed them and where the search offered them, or passed
the one the raise runs in, already: BPMN 2.0.2 §10.3.5 gives each Sub-Process instance its Event Sub-Processes, and CIB's
finders visit each flow scope once, the Multi-Instance body `#multiInstanceBody` declaring none (#158). A called root
wraps nothing: its Event Sub-Processes are its called process's, and a recursive Call's root holds a root of the same
Call. -/
def wrapsOwnScope (state : State) (occurrence : ScopeOccurrence) (held : Option ScopeOccurrence) : Bool :=
  held.any (·.element == occurrence.element) && !state.calledRoot occurrence.id

/-- The Event Sub-Processes of `occurrence` that may catch a raise from `origin` (PC-ERROR-02). One the raise
originates inside is no candidate, so a rethrow passes the handler that runs it, or that an interrupting handler's
completion is disposing of, to the host's boundaries and outward (BPMN 2.0.2 §13.5.4: "control passes to the boundary
Event"; CIB-INT-0022). Refused under every profile, dynamic-only because they rest on what a running handler raises:
an Escalation from deeper inside a handler that matches it (`escalation-rethrow-reenters-handler`), which CIB catches
with that handler again; and a raise from an interrupting handler that another Event Sub-Process of the same scope would
catch (`rethrow-caught-by-sibling-handler`), which CIB starts (CIB-DEV-0003). Both are restrictions of the `bpmn-2.0.2`
meaning, never that meaning: §13.5.4 passes the running handler at any depth and starts no new handler while the parent
is Failing or Terminating, so both raises would go on outward. A scope occurrence that only wraps one of its own element
offers none (`wrapsOwnScope`). -/
def handlerCandidates (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) (occurrence : ScopeOccurrence) :
    Except Failure (List (ElementId × Subscription × Bool)) :=
  let held := heldOnChain state occurrence.id (state.scopes.length + 1) origin.scope
  if wrapsOwnScope state occurrence held then .ok [] else
  let handlers := eventSubProcesses ctx state occurrence
  match held.bind fun held => (handlers.find? (some ·.1 == held.element)).map (held, ·) with
  | none => .ok handlers
  | some (held, (element, start, interrupting)) =>
    let others := handlers.filter (·.1 != element)
    if (ctx.catches raised start.trigger).isSome && !passesHandlerAtAnyDepth raised && origin.scope != held.id then
      .error (.unsupported "escalation-rethrow-reenters-handler") -- dynamic-only: how deep in its handler a raise runs
    else if interrupting && (best? ctx raised (·.2.1.trigger) others).isSome then
      .error (.unsupported "rethrow-caught-by-sibling-handler") -- dynamic-only: what a running handler raises
    else .ok others

/-- What a compensation handler's context offers a raise under `propagatesFromTrigger` (#159), as the Event
Sub-Processes and the boundaries of `record`'s completed subject, whose place the context stands for: the subject's
catchers only when the subject encloses `raising`, the handler the raise runs in, in the model, as CIB's search walks
the handler's model flow scopes (`tree/ActivityExecutionHierarchyWalker.java:44-73`); its Event Sub-Processes but one
holding that handler, unless the record is a Multi-Instance body's, and its boundaries, unless it is a Multi-Instance
instance's, whose boundaries belong to the body (`BpmnParse.java:3290-3295`). An instance's record is retained in a
scope occurrence of its own subject, the body's or its group's context. -/
def contextCandidates (ctx : Ctx) (state : State) (record : Compensable) (raising : Option ElementId) :
    List (ElementId × Subscription × Bool) × List Boundary :=
  let fuel := ctx.program.elements.length + 1
  let encloses := raising.any (within ctx record.subject fuel)
  let looping := ((ctx.program.element? record.subject).bind (·.envelope?)).any (·.multiInstance.isSome)
  let perInstance := (state.scopes.find? (·.id == record.scope)).any (·.element == some record.subject)
  (if encloses && (!looping || perInstance) then
      (startsOf ctx (ctx.program.children (some record.subject))).filter fun (element, _, _) =>
        !raising.any (within ctx element fuel)
    else [],
    if encloses && (!looping || !perInstance) then boundariesOf ctx record.subject else [])

/-- The catcher a compensation handler's context offers (`contextCandidates`) that fires. A catcher there has no chosen
meaning yet, so these are refused, dynamic-only, as they rest on what a running handler raises: an Event Sub-Process
that catches, which would start into a completed subject; a boundary that interrupts, or catches a Cancel, which
interrupts whatever the boundary declares (`leaveOccurrence`); a boundary's catch variables (CIB-EXT-0028); and a
boundary whose flows would leave into a scope occurrence that does not declare the subject. What is left is a
non-interrupting boundary, which the search fires (`contextFires`). -/
def contextCatcher (ctx : Ctx) (raised : Raised) (state : State) (record : Compensable) (raising : Option ElementId) :
    Except Failure (Option Boundary) :=
  let candidates := contextCandidates ctx state record raising
  if (best? ctx raised (·.2.1.trigger) candidates.1).isSome then
    .error (.unsupported "compensation-context-event-subprocess") -- dynamic-only: what a running handler raises
  else match best? ctx raised (·.subscription.trigger) candidates.2 with
    | none => .ok none
    | some (boundary, writes) =>
      if boundary.interrupting || raised.isCancel then
        .error (.unsupported "compensation-context-interrupting-boundary") -- dynamic-only: what a running handler raises
      else if !writes.isEmpty then
        .error (.unsupported "compensation-context-catch-variables") -- dynamic-only: what a running handler raises
      else if !(state.scopes.any (·.id == record.scope) &&
          (state.childrenOf ctx.program record.scope).any (·.header.id == record.subject)) then
        .error (.unsupported "compensation-context-boundary-unplaced") -- dynamic-only: where the record was retained
      else .ok (some boundary)

/-- The Event Sub-Processes of `occurrence`, the scope occurrence holding a compensated subject's record, that a search
reaching it from the handler's context offers: all of them, since the chain it came along is not the handler's, and
CIB passes only the thrower's own model flow scope (`EscalationEventDefinitionFinder.java:58-61`). Refused,
dynamic-only, when an interrupting one of them runs and one of them would catch: a parent that is Terminating starts no
Event Sub-Process (BPMN 2.0.2 §13.5.4), where CIB starts it (CIB-DEV-0003), as `handlerCandidates` refuses a sibling
of a running interrupting handler. -/
def jumpCandidates (ctx : Ctx) (raised : Raised) (state : State) (occurrence : ScopeOccurrence) :
    Except Failure (List (ElementId × Subscription × Bool)) :=
  let handlers := eventSubProcesses ctx state occurrence
  let interrupted := handlers.any fun (element, _, interrupting) =>
    interrupting && state.scopes.any fun entry => entry.parent == some occurrence.id && entry.element == some element
  if interrupted && (best? ctx raised (·.2.1.trigger) handlers).isSome then
    .error (.unsupported "compensation-raise-in-interrupted-scope") -- dynamic-only: what a running handler raises
  else .ok handlers

/-- The Event Sub-Processes an ordinary scope occurrence offers: `jumpCandidates` when the search reached it from a
compensation handler's context (`jumped`), else `handlerCandidates`. -/
def levelCandidates (ctx : Ctx) (raised : Raised) (origin : Origin) (state : State) (occurrence : ScopeOccurrence) :
    Option (Option ElementId) → Except Failure (List (ElementId × Subscription × Bool))
  | none => handlerCandidates ctx raised origin state occurrence
  | some _ => jumpCandidates ctx raised state occurrence

end Kernel.Feature.Propagation
