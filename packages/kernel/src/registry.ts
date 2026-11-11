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
import * as Starts from "./feature/subscriptions/starts.js";
import * as Correlation from "./feature/subscriptions/correlation.js";
import * as Delivery from "./feature/subscriptions/delivery.js";
import { WriteRule } from "./state.js";

const workHooks: Work.WorkHooks = { ...Work.defaultWorkHooks, runDecision: Decision.runDecision };
const propagationHooks: Propagation.PropagationHooks = {
  ...Propagation.defaultPropagationHooks,
  mappedErrorOutputs: (ctx, origin, installed, state) => Work.mappedErrorOutputs(Data.writeOutputs, ctx, origin, installed, state),
  writeCaught: (ctx, scope, writes, state) => Data.writeOutputs(ctx, scope, writes, WriteRule.Outward, state),
  callOutputs: (ctx, root, state) => {
    const passed = Call.raisedOutputs(ctx, root, state);
    return passed.ok ? Data.writeOutputs(ctx, passed.value[0], passed.value[1], WriteRule.Outward, state) : passed;
  },
};

export const hooks: Hooks = {
  ...defaultHooks,
  arriveStart: Starts.arriveStart,
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
  resolveIncident: Work.resolveIncident,
  triggerActivity: Work.triggerActivity,
  trigger: Subscriptions.trigger,
  arm: Subscriptions.arm,
  armScope: Subscriptions.armScope,
  armGateway: Subscriptions.armGateway,
  raise: (ctx, raised, origin, state) => Propagation.raise(propagationHooks, ctx, raised, origin, state),
  compensate: Compensation.compensate,
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
  evaluate: Data.evaluate,
  catches: Subscriptions.catches,
  correlates: Correlation.correlates,
  startsFired: Starts.startsFired,
  delivered: Delivery.delivered,
  eventStart: Scopes.eventStart,
};
