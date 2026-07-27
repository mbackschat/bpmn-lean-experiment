import {
  VariableValueKind,
  type SemanticProcessProgram,
  type StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  EffectExecutionResultKind,
} from "./effect-probe.js";
import {
  runBpmnProcessWithHostEffects,
} from "./workflow-implementation.js";

export function runBpmnProcessEffectBypassMutation(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): Promise<CompletedProcessReceipt> {
  return runBpmnProcessWithHostEffects(
    start,
    semanticProcess,
    async () => {
      throw new TypeError(
        "Effect-bypass mutation does not host timer waits",
      );
    },
    async (request) => ({
      ...(request.handler === "createRelationshipLinkDelegate"
        ? {
            kind: EffectExecutionResultKind.BpmnError,
            code: "LinkLimitReachedError",
            message: "Link limit reached",
            localPatch: [
              {
                name: "newLinkId",
                value: { kind: VariableValueKind.Null },
              },
            ],
          }
        : {
            kind: EffectExecutionResultKind.Success,
            localPatch:
              request.handler === "createDocumentDelegate"
                ? [
                    {
                      name: "newDocRef",
                      value: {
                        kind: VariableValueKind.String,
                        value: "Document:42",
                      },
                    },
                  ]
                : [],
          }),
    }),
  );
}
