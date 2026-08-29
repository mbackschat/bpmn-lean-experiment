import {
  decodeHumanTaskCatalogV1,
  decodePublicWorkTask,
  parseStrictJson,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicWorkTask,
} from "@bpmn-lean/platform-contracts";
import type {
  ActorResolver,
  TaskAuthorizationPolicy,
} from "@bpmn-lean/platform-identity-policy";
import {
  isTaskClaimable,
  isTaskVisible,
} from "@bpmn-lean/platform-identity-policy";

import type {
  ActorVisibleSystemWorkTask,
  SystemWorkTask,
} from "./work-service.js";

/** Applies actor policy only after one complete system task image has been obtained. */
export function projectVisibleSystemWorkTask(
  item: SystemWorkTask,
  actors: ActorResolver,
  authorization: TaskAuthorizationPolicy,
): ActorVisibleSystemWorkTask | null {
  const actor = actors.resolveActor();
  const decision = authorization.decideTask(actor, {
    candidateGroupId: item.task.metadata?.assignment.candidates[0].id ?? null,
    claimActorId: item.claim.claim?.actorId ?? null,
  });
  if (!isTaskVisible(decision)) return null;
  return {
    ...item,
    publicTask: {
      task: structuredClone(item.task),
      hostingInstance: structuredClone(item.registration.instance),
      claimGeneration: item.claim.claimGeneration,
      claim: structuredClone(item.claim.claim),
      claimableByCurrentActor: isTaskClaimable(decision),
      ...(item.structuredTask === null
        ? {}
        : {
            catalogPresentation: {
              worklistPriority: item.structuredTask.taskDefinition.worklistPriority,
            },
          }),
    },
  };
}

export function sortPublicWorkTasks(tasks: PublicWorkTask[]): void {
  tasks.sort(compareWorkTasks);
}

export function compareUnicodeScalarStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const difference = Number(leftScalars[index]?.codePointAt(0)) -
      Number(rightScalars[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}

/** The Product 1 open-task fields the Work contract owns and republishes. */
const ownedEngineTaskKeys = ["id", "name", "state", "metadata"] as const;

/**
 * Narrows one engine-observed open task to the fields the Work contract owns.
 *
 * Product 1's published task grows with each semantic family, while the Work contract is a
 * deliberate subset that Product 2 serializes and re-decodes strictly. Passing the engine value
 * through therefore turned every engine field addition into a Work wire break rather than a value
 * Work ignores: the Activity data-input family's `inputs` collection is the current example, and
 * `metadata` was the previous one. Selecting the owned fields here keeps the strict decoder strict
 * without teaching Work about semantics it does not present.
 *
 * A non-object reaches the decoder unchanged so that refusal stays owned by one place.
 */
export function projectEngineOpenWorkTask(
  value: unknown,
  hostingInstance: SystemWorkTask["registration"]["instance"],
): SystemWorkTask["task"] {
  return snapshotOpenWorkTask(
    typeof value === "object" && value !== null
      ? Object.fromEntries(
        ownedEngineTaskKeys
          .filter((key) => Object.hasOwn(value, key))
          .map((key) => [key, Reflect.get(value, key)]),
      )
      : value,
    hostingInstance,
  );
}

/** Normalizes an untrusted Product 1 task into the exact public task contract. */
export function snapshotOpenWorkTask(
  value: unknown,
  hostingInstance: SystemWorkTask["registration"]["instance"],
): SystemWorkTask["task"] {
  return decodePublicWorkTask({
    task: structuredClone(value),
    hostingInstance: structuredClone(hostingInstance),
    claimGeneration: 0,
    claim: null,
    claimableByCurrentActor: false,
  }).task;
}

export function decodeStoredOpenWorkTask(
  encoded: unknown,
  hostingInstance: SystemWorkTask["registration"]["instance"],
): SystemWorkTask["task"] {
  const text = requireStoredJsonText(encoded, "stored Work snapshot task");
  const decoded = snapshotOpenWorkTask(
    parseStrictJson(new TextEncoder().encode(text)),
    hostingInstance,
  );
  if (JSON.stringify(decoded) !== text) {
    throw new TypeError("stored Work snapshot task is not exact canonical JSON");
  }
  return decoded;
}

export function decodeStoredStructuredTask(
  encoded: unknown,
  item: Pick<SystemWorkTask, "registration" | "task">,
): SystemWorkTask["structuredTask"] {
  if (encoded === null) return null;
  const text = requireStoredJsonText(encoded, "stored Work structured task");
  const taskDefinitionValue = parseStrictJson(new TextEncoder().encode(text));
  const identity = item.registration.instance.definition;
  const catalog = decodeHumanTaskCatalogV1({
    schemaVersion: "bpmn-lean-human-task-catalog/v1",
    processId: identity.processId,
    semanticProfile: identity.semanticProfile,
    sourceSha256: identity.source.sha256,
    tasks: [taskDefinitionValue],
  });
  const taskDefinition = catalog.tasks[0];
  if (taskDefinition === undefined || taskDefinition.elementId !== item.task.id.elementId) {
    throw new TypeError("stored Work structured task disagrees with its task element");
  }
  if (JSON.stringify(taskDefinition) !== text) {
    throw new TypeError("stored Work structured task is not exact canonical JSON");
  }
  return {
    catalogIdentity: {
      processId: identity.processId,
      version: identity.version,
      sourceSha256: identity.source.sha256,
      semanticProfile: identity.semanticProfile,
    },
    taskDefinition,
  };
}

function compareWorkTasks(left: PublicWorkTask, right: PublicWorkTask): number {
  return (right.catalogPresentation?.worklistPriority ?? 50) -
      (left.catalogPresentation?.worklistPriority ?? 50) ||
    compareUnicodeScalarStrings(
      left.hostingInstance.processInstanceId,
      right.hostingInstance.processInstanceId,
    ) ||
    compareUnicodeScalarStrings(
      left.task.id.processInstanceId,
      right.task.id.processInstanceId,
    ) ||
    compareUnicodeScalarStrings(left.task.id.elementId, right.task.id.elementId) ||
    left.task.id.activation - right.task.id.activation;
}

function requireStoredJsonText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be nonempty text`);
  }
  return value;
}
