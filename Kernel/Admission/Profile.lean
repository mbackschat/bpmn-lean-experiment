module

public import Kernel.IL.Types

/-! # Admission of a program's profile options. A refusal carries a stable code.

A profile may select only behaviour the kernel implements. `Reach.abnormalScope` says whether the program's own shape
reaches the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or at a called
process's level, or an interrupting Event Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only
those programs, since the kernel has only the normal-continuation semantics of CIB-INT-0007. `errorExitCompensation`
and `multiInstanceCompensation` are refused likewise only for the programs their alternative would change.
-/

public section

namespace Kernel.Admission.Profile

def compensationHandlerFailure : CompensationHandlerFailure → Option String
  | .failsInstance => none
  | .selected _ => some "profile.compensationHandlerFailure.selected"
  | .propagatesFromHandler => none

/-- What the program's own shape reaches, for the options that govern only such programs. -/
structure Reach where
  /-- An abnormal scope end. -/
  abnormalScope : Bool
  /-- A Multi-Instance loop. -/
  loops : Bool
  /-- A Sub-Process with compensable work that an Error can leave. -/
  errorExit : Bool
  /-- A Multi-Instance Task or Call with a compensation handler. -/
  loopedHandler : Bool

/-- For a program with a Multi-Instance loop, the option combinations that would read a loop expression under two
engines at once ([Multi-Instance level](../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#option-combinations)):
JUEL without CIB's counters or its input failure, and Simple Boolean with CIB's counters. A sequential re-read with
aggregated outputs is refused too: BPMN 2.0.2 §13.3.7 aggregates the output collection in the form of an input
collection read once, which a re-read no longer gives. -/
def multiInstance (loops : Bool) (selected : ProfileOptions) : Option String :=
  if !loops then none
  else if selected.multiInstanceCollection == .sequentialReread && selected.multiInstanceOutputs == .aggregates then
    some "profile.multiInstanceCollection.sequentialReread"
  else if selected.evaluator == .juel then
    if selected.multiInstanceCounters == .none then some "profile.multiInstanceCounters.none"
    else if selected.multiInstanceInputFailure == .hold then some "profile.multiInstanceInputFailure.hold"
    else none
  else if selected.multiInstanceCounters == .cibLocals then some "profile.multiInstanceCounters.cibLocals"
  else none

/-- One value a profile option can select other than its standards reading, classified by whether its meaning depends on
the closure's run order: `needs` is the schedule its meaning needs and the stable code admission refuses it with under
any other schedule, `none` where it means the same under every run order. Each enumerated `ProfileOptions` field's every
non-default value is listed exactly once (the order-class guard in `scripts/kernel-guards-refusal.ts` reads this table
against the option record), so a new option value is classified when it is added. -/
structure OrderClass where
  selects : ProfileOptions → Bool
  needs : Option (BranchSchedule × String)

/-- The profile option values by run-order dependence (DC28, probes P03, P09, P11 and P12 of K0.10b, KD3). The
order-dependent ones:

- `unhandledError = endsThrowingPath`: ending only the throwing path, `Kernel.Feature.Propagation.endsInstanceWithOutputs`
  reads whether the origin's scope is idle, which the other branches' progress decides (P03). Admitting it under
  `orderInvariant` needs more than this table: the IL's `Unhandled` region (`Kernel.Laws.Flow.Unhandled`,
  `Kernel.Admission.Flow.unhandled`) has no issuer for an Error a failing compensation handler raises (P12 F1), so the
  removal such an Error makes is outside every unit's account.
- `raisedCallOutputs = atCalledRoot`: `Kernel.Feature.Propagation.busyCalledRoot` reads every occurrence and token of the
  called instance (P03).
- `messageNames` and `signalNames = addresses`: an address may be an expression over the variables the other branches
  write, evaluated when the subscription opens or the throw runs (DC27; P09: the premise is not free).
- `multiInstanceCounters = cibLocals`: each completion writes counters that carry the completed count, so the order of
  completions shows (P11).
- `inclusiveJoinReach = outgoingOnly`: a boundary token outside the reach fires the join a second time, so the join is
  not confluent (KD3, T4a F6).

`branchSchedule = declarationDepthFirst` is the run order itself. -/
def orderClasses : List OrderClass := [
  ⟨(·.evaluator == .juel), none⟩,
  ⟨(·.submission == .installsVariables), none⟩,
  ⟨(·.undeclaredWrite == .atInstanceRoot), none⟩,
  ⟨(·.errorPathOutputs == .mapped), none⟩,
  ⟨(·.raisedCallOutputs == .atCalledRoot), some (.declarationDepthFirst, "profile.raisedCallOutputs.atCalledRoot.orderInvariant")⟩,
  ⟨(·.technicalFailure == .incident), none⟩,
  ⟨(·.continuationFailure == .incident), none⟩,
  ⟨(·.conditionOrder == .beforeOutputs), none⟩,
  ⟨(·.messageCorrelation == .apiCriteria), none⟩,
  ⟨(·.deliveryVariables == .installs), none⟩,
  ⟨(·.multiInstanceFinalBody == .modeSpecific), none⟩,
  ⟨(·.multiInstanceOutputs == .none), none⟩,
  ⟨(·.compensationOrder == .allAtOnce), none⟩,
  ⟨(·.compensationHandlerFailure matches .selected _), none⟩,
  ⟨(·.compensationHandlerFailure == .propagatesFromHandler), none⟩,
  ⟨(·.implicitCompensation == .everySubProcess), none⟩,
  ⟨(·.errorExitCompensation == .compensatesContained), none⟩,
  ⟨(·.multiInstanceCompensation == .perInstance), none⟩,
  ⟨(·.transactionMethods == .compatibilityAsCompensate), none⟩,
  ⟨(·.compensationReferenceScope == .eventSubProcessParent), none⟩,
  ⟨(·.abnormalScopeEnd == .completesNormally), none⟩,
  ⟨(·.unhandledError == .endsThrowingPath), some (.declarationDepthFirst, "profile.unhandledError.endsThrowingPath.orderInvariant")⟩,
  ⟨(·.errorCatchVariables == .eventScope), none⟩,
  ⟨(·.callBindingTime == .invocation), none⟩,
  ⟨(·.multiInstanceBinding == .loopReferences), none⟩,
  ⟨(·.effectResultValues == .activityLocals), none⟩,
  ⟨(·.outputContext == .activityScope), none⟩,
  ⟨(·.multiInstanceCounters == .cibLocals), some (.declarationDepthFirst, "profile.multiInstanceCounters.cibLocals.orderInvariant")⟩,
  ⟨(·.multiInstanceInputFailure == .rollback), none⟩,
  ⟨(·.multiInstanceCount == .javaInt), none⟩,
  ⟨(·.multiInstanceCollection == .sequentialReread), none⟩,
  ⟨(·.businessRuleTask == .decisionTable), none⟩,
  ⟨(·.scriptTask == .javascript), none⟩,
  ⟨(·.configuredTask == .refused), none⟩,
  ⟨(·.inclusiveJoinReach == .outgoingOnly), some (.declarationDepthFirst, "profile.inclusiveJoinReach.outgoingOnly.orderInvariant")⟩,
  ⟨(·.branchSchedule == .declarationDepthFirst), none⟩,
  ⟨(·.conditionalRetrigger == .eachWrite), none⟩,
  ⟨(·.malformedTimer == .rollsBackArming), none⟩,
  ⟨(·.messageNames == .addresses), some (.declarationDepthFirst, "profile.messageNames.addresses.orderInvariant")⟩,
  ⟨(·.scopeStart == .required), none⟩,
  ⟨(·.signalNames == .addresses), some (.declarationDepthFirst, "profile.signalNames.addresses.orderInvariant")⟩,
  ⟨(·.signalPayload == .variables), none⟩,
  ⟨(·.signalDelivery == .occurrenceTargeted), none⟩,
  ⟨(·.conditionalStart == .submittedContext), none⟩,
  ⟨(·.calledElementResolution == .cibKey), none⟩,
  ⟨(·.messageThrowForms == .cibForms), none⟩,
  ⟨(·.deploymentErrors == .cibDeployment), none⟩,
  ⟨(·.handlerEscalation == .reentersHandler), none⟩]

/-- The first selected option value whose meaning needs another run order than `selected.branchSchedule`. -/
def orderDependent (selected : ProfileOptions) : Option String :=
  orderClasses.findSome? fun entry => match entry.needs with
    | some (schedule, code) => if entry.selects selected && selected.branchSchedule != schedule then some code else none
    | none => none

def options (reach : Reach) (selected : ProfileOptions) : Option String :=
  (if selected.compensationOrder == .allAtOnce then some "profile.compensationOrder.allAtOnce" else none) <|>
  compensationHandlerFailure selected.compensationHandlerFailure <|>
  (if reach.errorExit && selected.errorExitCompensation == .compensatesContained then
    some "profile.errorExitCompensation.compensatesContained" else none) <|>
  (if reach.loopedHandler && selected.multiInstanceCompensation == .perInstance then
    some "profile.multiInstanceCompensation.perInstance" else none) <|>
  (if selected.callBindingTime == .invocation then some "profile.callBindingTime.invocation" else none) <|>
  (if selected.timerZone.isSome then some "profile.timerZone" else none) <|>
  (if reach.abnormalScope && selected.abnormalScopeEnd == .withoutOutflow then some "profile.abnormalScopeEnd.withoutOutflow" else none) <|>
  (if selected.deploymentErrors == .cibDeployment then some "profile.deploymentErrors.cibDeployment" else none) <|>
  (if selected.handlerEscalation == .reentersHandler then some "profile.handlerEscalation.reentersHandler" else none) <|>
  (if selected.defaultRetryCycle.isSome then some "profile.defaultRetryCycle" else none) <|>
  (if selected.inertExtensions.isEmpty then none else some "profile.inertExtensions") <|>
  multiInstance reach.loops selected <|>
  orderDependent selected

end Kernel.Admission.Profile
