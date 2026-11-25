/** Registry, transcribed from `Kernel/Registry.lean`: the hooks record the features fill. Only `run.ts` imports it. */
import { defaultHooks, type Hooks } from "./hooks.js";
import * as Data from "./feature/data.js";
import * as Decision from "./feature/decision.js";
import * as Flow from "./feature/flow.js";
import * as Work from "./feature/work.js";
import * as Call from "./feature/work/call.js";
import * as Compensation from "./feature/compensation.js";
import * as MultiInstance from "./feature/multi-instance.js";
import * as Propagation from "./feature/propagation.js";
import * as Scopes from "./feature/scopes.js";
import * as Subscriptions from "./feature/subscriptions.js";
import * as Starts from "./feature/starts.js";
import * as Correlation from "./feature/correlation.js";
import * as Delivery from "./feature/subscriptions/delivery.js";
import { FailureTag, WriteRule, failed, type Outcome } from "./state.js";

/** What Work reaches of its sub-features: Decision's tables, Correlation's API criteria and a Message payload's bindings. */
const workHooks: Work.WorkHooks = {
  ...Work.defaultWorkHooks, runDecision: Decision.runDecision, criteriaHold: Correlation.criteriaHold,
  payloadBindings: Delivery.payloadBindings,
};
/** What Starts reaches of Subscriptions: whether a trigger fires a start, and a Message payload's bindings. */
const startsHooks: Starts.StartsHooks = { ...Starts.defaultStartsHooks, fires: Subscriptions.fires, payloadBindings: Delivery.payloadBindings };
/** What Subscriptions reaches of Correlation: the recheck of a Message firing's correlation. */
const subscriptionsHooks: Subscriptions.SubscriptionsHooks = {
  ...Subscriptions.defaultSubscriptionsHooks, correlationAccepts: Correlation.correlationAccepts,
};
const propagationHooks: Propagation.PropagationHooks = {
  ...Propagation.defaultPropagationHooks,
  mappedErrorOutputs: (ctx, origin, installed, state) => Work.mappedErrorOutputs(Data.writeOutputs, ctx, origin, installed, state),
  writeCaught: (ctx, scope, writes, state) => Data.writeOutputs(ctx, scope, writes, WriteRule.Outward, state),
  callOutputs: (ctx, root, state) => {
    const passed = Call.raisedOutputs(ctx, root, state);
    return passed.ok ? Data.writeOutputs(ctx, passed.value[0], passed.value[1], WriteRule.Outward, state) : passed;
  },
  dropRuns: Compensation.dropWithin,
  handlerRecord: Compensation.runningRecord,
};

/** `Hooks.failJob` until the job model's stage (AD8) fills it with Work's failure. */
function jobFailureRefused(): Outcome {
  // dynamic-only: no feature opens a job item before that stage, so no admission sees one
  return failed(FailureTag.Unsupported, "job-failure");
}

export const hooks: Hooks = {
  ...defaultHooks,
  arriveStart: (ctx, header, payload, trigger, occurrence, state) => Starts.arriveStart(startsHooks, ctx, header, payload, trigger, occurrence, state),
  arriveActivity: (ctx, header, payload, occurrence, state) => Work.arriveActivity(workHooks, ctx, header, payload, occurrence, state),
  arriveMultiInstance: MultiInstance.arriveMultiInstance,
  arriveScope: Scopes.arriveScope,
  arriveGateway: Flow.arriveGateway,
  arriveLink: Flow.arriveLink,
  arriveCatch: Subscriptions.arriveCatch,
  arriveThrow: Propagation.arriveThrow,
  completeScope: Scopes.completeScope,
  completeCall: Work.completeCall,
  completeBody: MultiInstance.completeBody,
  completeUserTask: Work.completeUserTask,
  effectResult: Work.effectResult,
  retryIncident: Work.retryIncident,
  cancelIncidentProcess: Work.cancelIncidentProcess,
  failJob: jobFailureRefused,
  triggerActivity: (ctx, header, payload, item, fired, state) => Work.triggerActivity(workHooks, ctx, header, payload, item, fired, state),
  trigger: (ctx, item, fired, state) => Subscriptions.trigger(subscriptionsHooks, ctx, item, fired, state),
  arm: Subscriptions.arm,
  armScope: Subscriptions.armScope,
  armGateway: Subscriptions.armGateway,
  raise: (ctx, raised, origin, state) => Propagation.raise(propagationHooks, ctx, raised, origin, state),
  compensate: Compensation.compensate,
  compensationReady: Compensation.ready,
  failCompensation: Compensation.failCompensation,
  leave: Subscriptions.leave,
  written: Subscriptions.offerWrites,
  select: Flow.select,
  writeOutputs: Data.writeOutputs,
  removeVariables: Data.removeVariables,
  completed: Compensation.completed,
  outflow: Flow.outflow,
  instanceCompleted: MultiInstance.instanceCompleted,
  handlerCompleted: Compensation.handlerCompleted,
  handlerEnded: Compensation.handlerEnded,
  evaluate: Data.evaluate,
  catches: Subscriptions.catches,
  competes: Subscriptions.competes,
  correlates: Correlation.correlates,
  startsFired: (ctx, input) => Starts.startsFired(startsHooks, ctx, input),
  delivered: Delivery.delivered,
  // Scopes reads an Event Sub-Process's start and declared flag; Subscriptions decides whether that start interrupts.
  eventStart: (payload) => {
    const read = Scopes.eventStart(payload);
    return read === null ? null : [read[0], Subscriptions.startInterrupts(read[0], read[1])];
  },
};
