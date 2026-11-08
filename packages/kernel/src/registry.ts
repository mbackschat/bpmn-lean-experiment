/** Registry, transcribed from `Kernel/Registry.lean`: the hooks record the features fill. Only `run.ts` imports it. */
import { defaultHooks, type Hooks } from "./hooks.js";
import { evaluate } from "./feature/data.js";
import { arriveGateway, startProcess } from "./feature/flow.js";
import { arriveActivity, completeUserTask } from "./feature/work.js";
import { arriveThrow } from "./feature/propagation.js";

export const hooks: Hooks = {
  ...defaultHooks,
  startProcess,
  arriveActivity,
  arriveGateway,
  arriveThrow,
  completeUserTask,
  evaluate,
};
