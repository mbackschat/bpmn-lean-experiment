import {
  PARALLEL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
  SemanticProfileId,
} from "@bpmn-lean/semantic-core";

import {
  locateContainedElements,
  orderedElementDiagnostics,
} from "./admission-diagnostics.js";
import {
  compileMappedServiceTaskSource,
} from "./mapped-service-task-source-admission.js";
import {
  compileCallActivityCheckedProcess,
} from "./call-activity-source.js";
import {
  compileCheckedProcess,
} from "./checked-process-compiler.js";
import { BpmnSourceDiagnosticCode } from "./contracts.js";
import type {
  BpmnSourceIdentity,
  CheckedCompilationProjection,
} from "./contracts.js";
import {
  asElement,
} from "./moddle-graph.js";
import {
  exactForeignAttributeRejections,
  foreignAttributeConsumingTypes,
  foreignAttributeRejections,
  preservationCapability,
} from "./preserved-element-classification.js";
import type { AdmittedSourceOverlay } from "./source-overlay.js";
import {
  admitsUserTaskMetadataForeignAttribute,
  isUserTaskMetadataProfile,
  userTaskMetadataProfile,
} from "./user-task-metadata-source.js";
import {
  compileSequentialMultiInstanceCheckedProcess,
} from "./sequential-multi-instance-source.js";
import {
  compileParallelMultiInstanceCheckedProcess,
} from "./parallel-multi-instance-source.js";
import {
  compileActivityDataInputCheckedProcess,
} from "./activity-data-input-source.js";
import {
  compileActivityDataOutputCheckedProcess,
} from "./activity-data-output-source.js";
import {
  compileMessagePayloadCatchCheckedProcess,
} from "./message-payload-catch-source.js";

export const CompilationDispatchId = Object.freeze({
  Generic: "generic",
  MappedSuccessServiceTask: "mappedSuccessServiceTask",
  MappedBoundaryErrorServiceTask: "mappedBoundaryErrorServiceTask",
  CallActivity: "callActivity",
  UserTaskMetadata: "userTaskMetadata",
  SequentialMultiInstanceUserTask: "sequentialMultiInstanceUserTask",
  ParallelMultiInstanceUserTask: "parallelMultiInstanceUserTask",
  ActivityDataInputUserTask: "activityDataInputUserTask",
  ActivityDataOutputUserTask: "activityDataOutputUserTask",
  MessagePayloadCatch: "messagePayloadCatch",
} as const);

export type CompilationDispatchId =
  typeof CompilationDispatchId[keyof typeof CompilationDispatchId];

type SelectedReader = (
  rootElement: unknown,
  source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null,
) => CheckedCompilationProjection;

type CompilationDispatch =
  | Readonly<{
    id: typeof CompilationDispatchId.Generic;
    semanticProfile: null;
    reader: typeof compileCheckedProcess;
  }>
  | Readonly<{
    id: Exclude<CompilationDispatchId, typeof CompilationDispatchId.Generic>;
    semanticProfile: string;
    reader: SelectedReader;
  }>;

const genericDispatch = {
  id: CompilationDispatchId.Generic,
  semanticProfile: null,
  reader: compileCheckedProcess,
} as const satisfies CompilationDispatch;

/** The complete engine-owned source-reader denominator. */
export const compilationDispatches: ReadonlyArray<CompilationDispatch> =
  Object.freeze([
    genericDispatch,
    {
      id: CompilationDispatchId.MappedSuccessServiceTask,
      semanticProfile: SemanticProfileId.MappedSuccessServiceTask,
      reader: (rootElement, source, overlay) => compileMappedServiceTaskSource(
        rootElement,
        source,
        SemanticProfileId.MappedSuccessServiceTask,
        overlay,
      ),
    },
    {
      id: CompilationDispatchId.MappedBoundaryErrorServiceTask,
      semanticProfile: SemanticProfileId.MappedBoundaryErrorServiceTask,
      reader: (rootElement, source, overlay) => compileMappedServiceTaskSource(
        rootElement,
        source,
        SemanticProfileId.MappedBoundaryErrorServiceTask,
        overlay,
      ),
    },
    {
      id: CompilationDispatchId.CallActivity,
      semanticProfile: SemanticProfileId.CalledProcessCallActivity,
      reader: (rootElement, source, overlay) =>
        overlay === null
          ? compileCallActivityWithClassification(rootElement, source)
          : unsupported("The Call Activity profile does not admit a source overlay."),
    },
    {
      id: CompilationDispatchId.UserTaskMetadata,
      semanticProfile: userTaskMetadataProfile,
      reader: (rootElement, source, overlay) => compileUserTaskMetadataSource(
        rootElement,
        source,
        overlay,
        userTaskMetadataProfile,
      ),
    },
    {
      id: CompilationDispatchId.SequentialMultiInstanceUserTask,
      semanticProfile: SEQUENTIAL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
      reader: (rootElement, source, overlay) =>
        overlay === null
          ? compileSequentialMultiInstanceCheckedProcess(
              rootElement,
              source,
              null,
            )
          : unsupported(
              "The Sequential Multi-Instance profile does not admit a source overlay.",
            ),
    },
    {
      id: CompilationDispatchId.ParallelMultiInstanceUserTask,
      semanticProfile: PARALLEL_MULTI_INSTANCE_USER_TASK_PROFILE_ID,
      reader: (rootElement, source, overlay) =>
        overlay === null
          ? compileParallelMultiInstanceCheckedProcess(
              rootElement,
              source,
              null,
            )
          : unsupported(
              "The Parallel Multi-Instance profile does not admit a source overlay.",
            ),
    },
    {
      id: CompilationDispatchId.ActivityDataInputUserTask,
      semanticProfile: SemanticProfileId.ActivityDataInputUserTask,
      reader: (rootElement, source, overlay) =>
        overlay === null
          ? compileActivityDataInputCheckedProcess(rootElement, source, null)
          : unsupported(
              "The Activity data-input profile does not admit a source overlay.",
            ),
    },
    {
      id: CompilationDispatchId.ActivityDataOutputUserTask,
      semanticProfile: SemanticProfileId.ActivityDataOutputUserTask,
      reader: (rootElement, source, overlay) =>
        overlay === null
          ? compileActivityDataOutputCheckedProcess(rootElement, source, null)
          : unsupported(
              "The Activity data-output profile does not admit a source overlay.",
            ),
    },
    {
      id: CompilationDispatchId.MessagePayloadCatch,
      semanticProfile: SemanticProfileId.MessagePayloadCatch,
      reader: (rootElement, source, overlay) =>
        overlay === null
          ? compileMessagePayloadCatchCheckedProcess(rootElement, source, null)
          : unsupported(
              "The Message payload catch profile does not admit a source overlay.",
            ),
    },
  ]);

export function compileDispatchedCheckedProcess(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  semanticProfile: string,
  overlay: AdmittedSourceOverlay | null,
): CheckedCompilationProjection {
  const dispatch = compilationDispatches.find(
    (entry) => entry.semanticProfile === semanticProfile ||
      (entry.id === CompilationDispatchId.UserTaskMetadata &&
        isUserTaskMetadataProfile(semanticProfile)),
  ) ?? genericDispatch;
  switch (dispatch.id) {
    case CompilationDispatchId.Generic:
      if (overlay !== null) {
        return unsupported("The selected profile does not admit a source overlay.");
      }
      return dispatch.reader(
        rootElement,
        source,
        semanticProfile,
        (definitions, located) =>
          foreignAttributeRejections(
            definitions,
            located,
            foreignAttributeConsumingTypes(semanticProfile),
          ),
        null,
      );
    case CompilationDispatchId.MappedSuccessServiceTask:
    case CompilationDispatchId.MappedBoundaryErrorServiceTask:
    case CompilationDispatchId.CallActivity:
      return dispatch.reader(rootElement, source, overlay);
    case CompilationDispatchId.UserTaskMetadata:
      return compileUserTaskMetadataSource(
        rootElement,
        source,
        overlay,
        semanticProfile,
      );
    case CompilationDispatchId.SequentialMultiInstanceUserTask:
    case CompilationDispatchId.ParallelMultiInstanceUserTask:
    case CompilationDispatchId.ActivityDataInputUserTask:
    case CompilationDispatchId.ActivityDataOutputUserTask:
    case CompilationDispatchId.MessagePayloadCatch:
      return dispatch.reader(rootElement, source, overlay);
    default:
      return assertNever(dispatch);
  }
}

function compileUserTaskMetadataSource(
  rootElement: unknown,
  source: BpmnSourceIdentity,
  overlay: AdmittedSourceOverlay | null,
  semanticProfile: string,
): CheckedCompilationProjection {
  return overlay === null
    ? compileCheckedProcess(
        rootElement,
        source,
        semanticProfile,
        (definitions, located) =>
          exactForeignAttributeRejections(
            definitions,
            located,
            admitsUserTaskMetadataForeignAttribute,
            preservationCapability(semanticProfile),
          ),
        null,
      )
    : unsupported("The User Task metadata profile does not admit a source overlay.");
}

function compileCallActivityWithClassification(
  rootElement: unknown,
  source: BpmnSourceIdentity,
): CheckedCompilationProjection {
  const projection = compileCallActivityCheckedProcess(
    rootElement,
    source,
    SemanticProfileId.CalledProcessCallActivity,
    null,
  );
  const definitions = asElement(rootElement);
  if (definitions === undefined) {
    return projection;
  }
  const classification = foreignAttributeRejections(
    definitions,
    locateContainedElements(definitions),
    new Set(),
  );
  return classification.length === 0
    ? projection
    : {
        checkedProcess: undefined,
        diagnostics: [
          ...orderedElementDiagnostics(classification),
          ...(projection.checkedProcess === undefined
            ? projection.diagnostics.filter(({ element }) => element === null)
            : []),
        ],
      };
}

function unsupported(evidence: string): CheckedCompilationProjection {
  return {
    checkedProcess: undefined,
    diagnostics: [{
      code: BpmnSourceDiagnosticCode.UnsupportedModel,
      element: null,
      evidence,
    }],
  };
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown compilation dispatch ${String(value)}`);
}
