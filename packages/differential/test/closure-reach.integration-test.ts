/**
 * The closure law of `flow.concurrentWrite` (issue #99) over every discovered admitted scenario: admission's closure
 * walk (`closureReach`, the walk `admission/flow.ts` refuses racing branches with, ascending out of Scopes and called
 * processes) reaches every occurrence one committed input begins in the instance, and counts every name the closure
 * writes once the input's own installation is done. A closure the walk under-counts would let a standards-profile model
 * whose result depends on branch order be admitted.
 *
 * The run is the oracle: each committed input of each scenario is stepped with the kernel's hooks, `written` observed,
 * and the walk begun where the input lands: the elements the first transition begins, the occurrence the input
 * completes (none for `setVariables`, `removeVariables` or `cancelIncidentProcess`), the Event Sub-Process whose start
 * it fires, every join parked before it, and every Conditional catch when it writes itself. Writes before the first
 * transition that begins or ends an occurrence are the input's own installation, which no branch makes.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ScopeKindTag,
  VisitTag,
  admit,
  closureReach,
  conditionalCatches,
  decodeProgram,
  elementHeader,
  elementScope,
  firingStimulusFromJson,
  hooks,
  programBoundary,
  programElement,
  programTarget,
  step,
  type Program,
  type State,
  type Visit,
} from "@bpmn-lean/kernel";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { DiscoveredKind, discoverScenarios, scenarioKernelInput } from "./scenario-discovery.ts";

type Write = Readonly<{ name: string }>;
type Transition = Readonly<{
  cause: Readonly<{ tag: string }>;
  started: ReadonlyArray<Readonly<{ occurrence: Readonly<{ element: string; processInstanceId: string }> }>>;
  ended: ReadonlyArray<unknown>;
}>;
type Observed = State & Readonly<{ journal: readonly Transition[]; instanceId: string; slots?: Readonly<{ parked?: ReadonlyArray<Readonly<{ flow: string }>> }> }>;

/** The visit that begins or, with `completes`, completes `id`, an element, or fires it, a boundary; `null` for neither. */
function begun(program: Program, id: string, completes: boolean): Visit | null {
  const element = programElement(program, id);
  if (element !== null) return completes ? { tag: VisitTag.Completes, element } : { tag: VisitTag.Enters, element };
  const boundary = programBoundary(program, id);
  return boundary === null ? null : { tag: VisitTag.Fires, boundary: boundary[1] };
}

/** The Event Sub-Process whose start `id` is, as begun. */
function eventSubProcess(program: Program, id: string): Visit | null {
  const element = programElement(program, id);
  const parent = element === null ? null : elementHeader(element).parent;
  const enclosing = parent === null ? null : programElement(program, parent);
  const scope = enclosing === null ? null : elementScope(enclosing);
  return enclosing !== null && scope !== null && scope[1].kind.tag === ScopeKindTag.EventSubProcess
    ? { tag: VisitTag.Enters, element: enclosing }
    : null;
}

test("admission's closure walk reaches every occurrence and counts every write of every committed input's closure", {
  timeout: pipelineTestTimeoutMs(),
}, async () => {
  const violations: string[] = [];
  let closures = 0;
  for (const scenario of await discoverScenarios()) {
    if (scenario.kind !== DiscoveredKind.Scenario) continue;
    const input = await scenarioKernelInput(scenario.relativePath, scenario.document.bpmn, scenario.document.profile);
    if (input.kind === "refused") continue;
    const decoded = decodeProgram(input.program);
    if (!decoded.ok || admit(decoded.value) !== null) continue;
    const program = decoded.value;
    let state: Observed | null = null;
    for (const item of scenario.document.stimuli) {
      const stimulus = firingStimulusFromJson(item);
      if (!stimulus.ok) break;
      const [command, firing] = stimulus.value;
      const log: Array<readonly [number, Write]> = [];
      const observed = {
        ...hooks,
        written: (ctx: Parameters<typeof hooks.written>[0], writes: readonly Write[], after: Observed) => {
          for (const write of writes) log.push([after.journal.length - 1, write]);
          return hooks.written(ctx, writes as Parameters<typeof hooks.written>[1], after);
        },
      } as typeof hooks;
      const before: Observed | null = state;
      const outcome = step(observed, program, before, firing);
      if (!outcome.ok) continue;
      state = outcome.value as Observed;
      const journal = state.journal;
      if (journal.length === 0) continue;
      closures += 1;
      const origins: Visit[] = [];
      for (const fact of journal[0]!.started) {
        const visit = begun(program, fact.occurrence.element, false);
        if (visit !== null) origins.push(visit);
      }
      const action = firing.tag === "command" ? firing.payload.action.tag : null;
      const landing = firing.tag === "start" ? null : firing.payload.occurrence?.element ?? null;
      const espStart = landing === null ? null : eventSubProcess(program, landing);
      if (espStart !== null) origins.push(espStart);
      for (const parked of before?.slots?.parked ?? []) {
        const join = programTarget(program, parked.flow);
        const visit = join === null ? null : begun(program, join, true);
        if (visit !== null && visit.tag === VisitTag.Completes) origins.push(visit);
      }
      if (log.length > 0 || action === "setVariables" || action === "removeVariables") origins.push(...conditionalCatches(program));
      if (landing !== null && action !== "setVariables" && action !== "removeVariables" && action !== "cancelIncidentProcess") {
        const visit = begun(program, landing, true);
        if (visit !== null) origins.push(visit);
      }
      const reach = closureReach(program, origins);
      const where = `${scenario.relativePath} ${command}`;
      for (const transition of journal) {
        for (const fact of transition.started) {
          const id = fact.occurrence.element;
          if (fact.occurrence.processInstanceId === state.instanceId && !reach.reached.includes(id)) {
            violations.push(`${where}: begins ${id} unreached`);
          }
        }
      }
      const installed = journal.findIndex((transition) => transition.started.length > 0 || transition.ended.length > 0);
      const { writes } = reach.footprint;
      for (const [index, write] of log) {
        const transition = journal[index];
        if (transition === undefined || transition.cause.tag === "input" || installed === -1 || index < installed) continue;
        if (!writes.all && !writes.names.includes(write.name) && !reach.locals.includes(write.name)) {
          violations.push(`${where}: writes ${write.name} uncounted`);
        }
      }
    }
  }
  assert.ok(closures > 0, "no closure was walked");
  assert.deepEqual(violations, []);
});
