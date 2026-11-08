/** Registry, transcribed from `Kernel/Registry.lean`: the hooks record the features fill. Only `run.ts` imports it. */
import type { Hooks } from "./hooks.js";
import * as Data from "./feature/data.js";
import * as Flow from "./feature/flow.js";
import * as Work from "./feature/work.js";
import * as Compensation from "./feature/compensation.js";
import * as MultiInstance from "./feature/multi-instance.js";
import * as Propagation from "./feature/propagation.js";
import * as Scopes from "./feature/scopes.js";
import * as Subscriptions from "./feature/subscriptions.js";

export const hooks: Hooks = {
  startProcess: Flow.startProcess,
  arriveActivity: Work.arriveActivity,
  arriveGateway: Flow.arriveGateway,
  arriveLink: Flow.arriveLink,
  arriveCatch: Subscriptions.arriveCatch,
  trigger: Subscriptions.trigger,
  arm: Subscriptions.arm,
  armGateway: Subscriptions.armGateway,
  catches: Subscriptions.catches,
  correlates: Subscriptions.correlates,
  arriveScope: Scopes.arriveScope,
  arriveThrow: Propagation.arriveThrow,
  completeScope: Scopes.completeScope,
  raise: Propagation.raise,
  startEventSubProcess: Scopes.startEventSubProcess,
  eventStart: Scopes.eventStart,
  armScope: Subscriptions.armScope,
  completeUserTask: Work.completeUserTask,
  resolveIncident: Work.resolveIncident,
  bodyWait: Work.bodyWait,
  arriveMultiInstance: MultiInstance.arriveMultiInstance,
  completeInstance: MultiInstance.completeInstance,
  multiInstanceMode: MultiInstance.modeName,
  completeCall: Work.completeCall,
  effectResult: Work.effectResult,
  triggerActivity: Work.triggerActivity,
  startActivity: Work.startActivity,
  retain: Compensation.retain,
  compensate: Compensation.compensate,
  completeCompensation: Compensation.completeCompensation,
  failCompensation: Compensation.failCompensation,
  evaluate: Data.evaluate,
};
