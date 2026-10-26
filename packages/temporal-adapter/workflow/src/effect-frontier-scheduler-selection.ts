import type { SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { createTemporalCompensationFrontierScheduler } from "./compensation-frontier-scheduler.js";
import {
  createTemporalOrdinaryEffectFrontierScheduler,
  ordinaryEffectFrontierHosts,
} from "./ordinary-effect-frontier-scheduler.js";
import type {
  EffectFrontierScheduler,
  OrdinaryEffectFrontierAdapters,
  OrdinaryEffectFrontierHistory,
} from "./ordinary-effect-frontier-scheduler.js";

/** The effect scheduler of one Workflow: the ordinary-effect frontier for the profiles it hosts, otherwise the compensation frontier. */
export function createTemporalEffectFrontierScheduler(
  program: SemanticProcessProgram,
  executeEffect: OrdinaryEffectFrontierAdapters["executeEffect"],
  failCapacity: OrdinaryEffectFrontierAdapters["failCapacity"],
  enqueueCompletion: OrdinaryEffectFrontierAdapters["enqueueCompletion"],
  newActivitiesFenced: OrdinaryEffectFrontierAdapters["newActivitiesFenced"],
  history: OrdinaryEffectFrontierHistory,
): EffectFrontierScheduler {
  return ordinaryEffectFrontierHosts(program)
    ? createTemporalOrdinaryEffectFrontierScheduler(program, executeEffect, failCapacity, enqueueCompletion,
      newActivitiesFenced, history)
    : createTemporalCompensationFrontierScheduler(program, executeEffect, failCapacity);
}
