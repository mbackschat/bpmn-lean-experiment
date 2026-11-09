/** Registry, transcribed from `Kernel/Registry.lean`: the hooks record the features fill. Only `run.ts` imports it. */
import { defaultHooks, type Hooks } from "./hooks.js";
import * as Data from "./feature/data.js";
import * as Flow from "./feature/flow.js";
import * as Work from "./feature/work.js";
import * as Compensation from "./feature/compensation.js";
import * as MultiInstance from "./feature/multi-instance.js";
import * as Propagation from "./feature/propagation.js";
import * as Scopes from "./feature/scopes.js";
import * as Subscriptions from "./feature/subscriptions.js";

export const hooks: Hooks = {
  ...defaultHooks,
  arriveStart: Subscriptions.arriveStart,
  arriveActivity: Work.arriveActivity,
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
  raise: Propagation.raise,
  compensate: Compensation.compensate,
  failCompensation: Compensation.failCompensation,
  leave: Subscriptions.leave,
  select: Flow.select,
  writeOutputs: Data.writeOutputs,
  removeVariables: Data.removeVariables,
  completed: Compensation.completed,
  outflow: Flow.outflow,
  instanceCompleted: MultiInstance.instanceCompleted,
  handlerCompleted: Compensation.handlerCompleted,
  evaluate: Data.evaluate,
  catches: Subscriptions.catches,
  correlates: Subscriptions.correlates,
  selectStart: Subscriptions.selectStart,
  eventStart: Scopes.eventStart,
};
