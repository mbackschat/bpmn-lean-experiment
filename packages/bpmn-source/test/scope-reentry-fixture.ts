/**
 * Source edits of the retained scope re-entry models shared by the source and runtime tests: each names the witness
 * topology of the [scope re-entry specification](../../../docs/capsules/SCOPE-REENTRY-SPEC.md#separating-witnesses) it
 * builds, and refuses to apply unless its anchor occurs exactly once.
 */
import assert from "node:assert/strict";

export function edit(xml: string, ...replacements: readonly (readonly [string, string])[]): string {
  return replacements.reduce((current, [from, to]) => {
    assert.equal(current.split(from).length, 2, from);
    return current.replace(from, to);
  }, xml);
}

export const inspectDamage = '<userTask id="InspectDamage" name="Inspect damage" />';
export const editDraft = '<userTask id="EditDraft" name="Edit draft" />';
export const reworkFlow = '<sequenceFlow id="Flow_Rework" sourceRef="AssessmentOutcome" targetRef="AssessmentRequested">';
export const reviseFlow = '<sequenceFlow id="Flow_Revise" sourceRef="ReviewOutcome" targetRef="RevisionRequested">';

/** Wraps a body's User Task in `levels` nested Sub-Processes, each adding one entry step to every closure reaching it. */
export function nest(xml: string, task: string, taskId: string, levels: number): string {
  let wrapped = task;
  for (let level = levels; level >= 1; level -= 1) {
    const id = `${taskId}Level${level}`;
    wrapped = `<subProcess id="${id}"><startEvent id="${id}Start" />${wrapped}<endEvent id="${id}End" />` +
      `<sequenceFlow id="${id}In" sourceRef="${id}Start" targetRef="${level === levels ? taskId : `${taskId}Level${level + 1}`}" />` +
      `<sequenceFlow id="${id}Out" sourceRef="${level === levels ? taskId : `${taskId}Level${level + 1}`}" targetRef="${id}End" />` +
      `</subProcess>`;
  }
  const outer = `${taskId}Level1`;
  return edit(xml, [`targetRef="${taskId}" />`, `targetRef="${outer}" />`],
    [`sourceRef="${taskId}" `, `sourceRef="${outer}" `], [task, wrapped]);
}

/** Routes a back-edge through a Sub-Process with an empty body, which adds its entry, End and completion. */
export function passThroughOnBackEdge(xml: string, flow: string, merge: string, beforeElement: string): string {
  return edit(xml, [flow, flow.replace(`targetRef="${merge}"`, 'targetRef="LogRework"')],
    [beforeElement, '<subProcess id="LogRework" name="Log rework"><startEvent id="LogOpened" /><endEvent id="LogClosed" />' +
      '<sequenceFlow id="Flow_Log" sourceRef="LogOpened" targetRef="LogClosed" /></subProcess>' +
      `<sequenceFlow id="Flow_Logged" sourceRef="LogRework" targetRef="${merge}" />${beforeElement}`]);
}
