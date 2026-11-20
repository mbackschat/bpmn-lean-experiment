/**
 * Admission of a program's profile options, transcribed from `Kernel/Admission/Profile.lean`. A refusal carries a
 * stable code.
 *
 * A profile may select only behaviour the kernel implements. `Reach.abnormalScope` says whether the program's own shape
 * reaches the abnormal end `ProfileOptions.abnormalScopeEnd` governs (a Terminate in a Sub-Process or at a called
 * process's level, or an interrupting Event Sub-Process, BPMN 2.0.2 §13.3.4, §13.5.6); the standards reading refuses only
 * those programs, since the kernel has only the normal-continuation semantics of CIB-INT-0007. `errorExitCompensation`
 * and `multiInstanceCompensation` are refused likewise only for the programs their alternative would change.
 */
import {
  AbnormalScopeEnd, BranchSchedule, BusinessRuleTask, CallBindingTime, CalledElementResolution, CollectionRead,
  CompensationHandlerFailureTag, CompensationOrder, CompensationReferenceScope, ConditionOrder, ConditionalRetrigger,
  ConditionalStart, ConfiguredTask, ContinuationFailure, DeliveryVariables, DeploymentErrors, ErrorCatchVariables,
  ErrorExitCompensation, ErrorPathOutputs, Evaluator, HandlerEscalation, ImplicitCompensation, InclusiveJoinReach,
  MalformedTimer, MessageCorrelation, MessageNames, MessageThrowForms, MultiInstanceBinding, MultiInstanceCompensation,
  MultiInstanceCount, MultiInstanceCounters, MultiInstanceFinalBody, MultiInstanceInputFailure, MultiInstanceOutputs,
  OutputContext, RaisedCallOutputs, ResultValues, ScopeStart, ScriptTask, SignalDelivery, SignalNames, SignalPayload,
  SubmissionRule, TechnicalFailure, TransactionMethods, UndeclaredWrite, UnhandledError, assertNever,
  type CompensationHandlerFailure, type ProfileOptions,
} from "../il/types.js";

function compensationHandlerFailure(selected: CompensationHandlerFailure): string | null {
  switch (selected.tag) {
    case CompensationHandlerFailureTag.FailsInstance:
    case CompensationHandlerFailureTag.PropagatesFromHandler:
      return null;
    case CompensationHandlerFailureTag.Selected:
      return "profile.compensationHandlerFailure.selected";
  }
  return assertNever(selected);
}

/** What the program's own shape reaches, for the options that govern only such programs. */
export interface Reach {
  /** An abnormal scope end. */
  readonly abnormalScope: boolean;
  /** A Multi-Instance loop. */
  readonly loops: boolean;
  /** A Sub-Process with compensable work that an Error can leave. */
  readonly errorExit: boolean;
  /** A Multi-Instance Task or Call with a compensation handler. */
  readonly loopedHandler: boolean;
}

/**
 * For a program with a Multi-Instance loop, the option combinations that would read a loop expression under two engines
 * at once: JUEL without CIB's counters or its input failure, and Simple Boolean with CIB's counters. A sequential
 * re-read with aggregated outputs is refused too: BPMN 2.0.2 §13.3.7 aggregates the output collection in the form of an
 * input collection read once, which a re-read no longer gives.
 */
function multiInstance(loops: boolean, selected: ProfileOptions): string | null {
  if (!loops) return null;
  if (selected.multiInstanceCollection === CollectionRead.SequentialReread &&
    selected.multiInstanceOutputs === MultiInstanceOutputs.Aggregates) {
    return "profile.multiInstanceCollection.sequentialReread";
  }
  if (selected.evaluator === Evaluator.Juel) {
    if (selected.multiInstanceCounters === MultiInstanceCounters.None) return "profile.multiInstanceCounters.none";
    if (selected.multiInstanceInputFailure === MultiInstanceInputFailure.Hold) return "profile.multiInstanceInputFailure.hold";
    return null;
  }
  return selected.multiInstanceCounters === MultiInstanceCounters.CibLocals ? "profile.multiInstanceCounters.cibLocals" : null;
}

/**
 * One value a profile option can select other than its standards reading, classified by whether its meaning depends on
 * the closure's run order: `needs` is the schedule its meaning needs and the stable code admission refuses it with under
 * any other schedule, `null` where it means the same under every run order. Each enumerated `ProfileOptions` field's
 * every non-default value is listed exactly once (the order-class guard in `scripts/kernel-guards-refusal.ts` reads this
 * table against the option record), so a new option value is classified when it is added.
 */
export interface OrderClass {
  readonly selects: (selected: ProfileOptions) => boolean;
  readonly needs: { readonly schedule: BranchSchedule; readonly code: string } | null;
}

/**
 * The profile option values by run-order dependence (DC28, probes P03, P09, P11 and P12 of K0.10b, KD3), transcribed
 * from `Kernel.Admission.Profile.orderClasses`, whose comment gives each order-dependent value's reason.
 */
const orderClasses: readonly OrderClass[] = [
  { selects: (selected) => selected.evaluator === Evaluator.Juel, needs: null },
  { selects: (selected) => selected.submission === SubmissionRule.InstallsVariables, needs: null },
  { selects: (selected) => selected.undeclaredWrite === UndeclaredWrite.AtInstanceRoot, needs: null },
  { selects: (selected) => selected.errorPathOutputs === ErrorPathOutputs.Mapped, needs: null },
  { selects: (selected) => selected.raisedCallOutputs === RaisedCallOutputs.AtCalledRoot,
    needs: { schedule: BranchSchedule.DeclarationDepthFirst, code: "profile.raisedCallOutputs.atCalledRoot.orderInvariant" } },
  { selects: (selected) => selected.technicalFailure === TechnicalFailure.Incident, needs: null },
  { selects: (selected) => selected.continuationFailure === ContinuationFailure.Incident, needs: null },
  { selects: (selected) => selected.conditionOrder === ConditionOrder.BeforeOutputs, needs: null },
  { selects: (selected) => selected.messageCorrelation === MessageCorrelation.ApiCriteria, needs: null },
  { selects: (selected) => selected.deliveryVariables === DeliveryVariables.Installs, needs: null },
  { selects: (selected) => selected.multiInstanceFinalBody === MultiInstanceFinalBody.ModeSpecific, needs: null },
  { selects: (selected) => selected.multiInstanceOutputs === MultiInstanceOutputs.None, needs: null },
  { selects: (selected) => selected.compensationOrder === CompensationOrder.AllAtOnce, needs: null },
  { selects: (selected) => selected.compensationHandlerFailure.tag === CompensationHandlerFailureTag.Selected,
    needs: null },
  { selects: (selected) => selected.compensationHandlerFailure.tag === CompensationHandlerFailureTag.PropagatesFromHandler,
    needs: null },
  { selects: (selected) => selected.implicitCompensation === ImplicitCompensation.EverySubProcess, needs: null },
  { selects: (selected) => selected.errorExitCompensation === ErrorExitCompensation.CompensatesContained, needs: null },
  { selects: (selected) => selected.multiInstanceCompensation === MultiInstanceCompensation.PerInstance, needs: null },
  { selects: (selected) => selected.transactionMethods === TransactionMethods.CompatibilityAsCompensate, needs: null },
  { selects: (selected) => selected.compensationReferenceScope === CompensationReferenceScope.EventSubProcessParent,
    needs: null },
  { selects: (selected) => selected.abnormalScopeEnd === AbnormalScopeEnd.CompletesNormally, needs: null },
  { selects: (selected) => selected.unhandledError === UnhandledError.EndsThrowingPath,
    needs: { schedule: BranchSchedule.DeclarationDepthFirst, code: "profile.unhandledError.endsThrowingPath.orderInvariant" } },
  { selects: (selected) => selected.errorCatchVariables === ErrorCatchVariables.EventScope, needs: null },
  { selects: (selected) => selected.callBindingTime === CallBindingTime.Invocation, needs: null },
  { selects: (selected) => selected.multiInstanceBinding === MultiInstanceBinding.LoopReferences, needs: null },
  { selects: (selected) => selected.effectResultValues === ResultValues.ActivityLocals, needs: null },
  { selects: (selected) => selected.outputContext === OutputContext.ActivityScope, needs: null },
  { selects: (selected) => selected.multiInstanceCounters === MultiInstanceCounters.CibLocals,
    needs: { schedule: BranchSchedule.DeclarationDepthFirst, code: "profile.multiInstanceCounters.cibLocals.orderInvariant" } },
  { selects: (selected) => selected.multiInstanceInputFailure === MultiInstanceInputFailure.Rollback, needs: null },
  { selects: (selected) => selected.multiInstanceCount === MultiInstanceCount.JavaInt, needs: null },
  { selects: (selected) => selected.multiInstanceCollection === CollectionRead.SequentialReread, needs: null },
  { selects: (selected) => selected.businessRuleTask === BusinessRuleTask.DecisionTable, needs: null },
  { selects: (selected) => selected.scriptTask === ScriptTask.Javascript, needs: null },
  { selects: (selected) => selected.configuredTask === ConfiguredTask.Refused, needs: null },
  { selects: (selected) => selected.inclusiveJoinReach === InclusiveJoinReach.OutgoingOnly,
    needs: { schedule: BranchSchedule.DeclarationDepthFirst, code: "profile.inclusiveJoinReach.outgoingOnly.orderInvariant" } },
  { selects: (selected) => selected.branchSchedule === BranchSchedule.DeclarationDepthFirst, needs: null },
  { selects: (selected) => selected.conditionalRetrigger === ConditionalRetrigger.EachWrite, needs: null },
  { selects: (selected) => selected.malformedTimer === MalformedTimer.RollsBackArming, needs: null },
  { selects: (selected) => selected.messageNames === MessageNames.Addresses,
    needs: { schedule: BranchSchedule.DeclarationDepthFirst, code: "profile.messageNames.addresses.orderInvariant" } },
  { selects: (selected) => selected.scopeStart === ScopeStart.Required, needs: null },
  { selects: (selected) => selected.signalNames === SignalNames.Addresses,
    needs: { schedule: BranchSchedule.DeclarationDepthFirst, code: "profile.signalNames.addresses.orderInvariant" } },
  { selects: (selected) => selected.signalPayload === SignalPayload.Variables, needs: null },
  { selects: (selected) => selected.signalDelivery === SignalDelivery.OccurrenceTargeted, needs: null },
  { selects: (selected) => selected.conditionalStart === ConditionalStart.SubmittedContext, needs: null },
  { selects: (selected) => selected.calledElementResolution === CalledElementResolution.CibKey, needs: null },
  { selects: (selected) => selected.messageThrowForms === MessageThrowForms.CibForms, needs: null },
  { selects: (selected) => selected.deploymentErrors === DeploymentErrors.CibDeployment, needs: null },
  { selects: (selected) => selected.handlerEscalation === HandlerEscalation.ReentersHandler, needs: null },
];

/** The first selected option value whose meaning needs another run order than `selected.branchSchedule`. */
function orderDependent(selected: ProfileOptions): string | null {
  for (const entry of orderClasses) {
    if (entry.needs !== null && entry.selects(selected) && selected.branchSchedule !== entry.needs.schedule) return entry.needs.code;
  }
  return null;
}

export function options(reach: Reach, selected: ProfileOptions): string | null {
  if (selected.compensationOrder === CompensationOrder.AllAtOnce) return "profile.compensationOrder.allAtOnce";
  const handlerFailure = compensationHandlerFailure(selected.compensationHandlerFailure);
  if (handlerFailure !== null) return handlerFailure;
  if (reach.errorExit && selected.errorExitCompensation === ErrorExitCompensation.CompensatesContained) {
    return "profile.errorExitCompensation.compensatesContained";
  }
  if (reach.loopedHandler && selected.multiInstanceCompensation === MultiInstanceCompensation.PerInstance) {
    return "profile.multiInstanceCompensation.perInstance";
  }
  if (selected.callBindingTime === CallBindingTime.Invocation) return "profile.callBindingTime.invocation";
  if (selected.timerZone !== null) return "profile.timerZone";
  if (reach.abnormalScope && selected.abnormalScopeEnd === AbnormalScopeEnd.WithoutOutflow) return "profile.abnormalScopeEnd.withoutOutflow";
  if (selected.deploymentErrors === DeploymentErrors.CibDeployment) return "profile.deploymentErrors.cibDeployment";
  if (selected.handlerEscalation === HandlerEscalation.ReentersHandler) return "profile.handlerEscalation.reentersHandler";
  if (selected.defaultRetryCycle !== null) return "profile.defaultRetryCycle";
  if (selected.inertExtensions.length > 0) return "profile.inertExtensions";
  const loops = multiInstance(reach.loops, selected);
  if (loops !== null) return loops;
  return orderDependent(selected);
}
