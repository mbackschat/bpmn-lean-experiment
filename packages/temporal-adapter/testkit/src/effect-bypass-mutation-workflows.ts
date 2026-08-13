import {
  EffectOperation,
  VariableValueKind,
  type SemanticProcessProgram,
  type StartProcessStimulus,
} from "@bpmn-lean/semantic-core";

import type {
  CompletedProcessReceipt,
} from "./contracts.js";
import {
  EffectExecutionResultKind,
  requireCompletedProcessReceipt,
} from "./contracts.js";
import {
  runBpmnProcessWithHostEffects,
} from "@bpmn-lean/temporal-workflow";

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
      ...(request.operation === EffectOperation.MappedBoundaryError
        ? {
            kind: EffectExecutionResultKind.BpmnError,
            code: "MappedBusinessError",
            message: "mapped business error",
            localPatch: [
              {
                name: "result",
                value: { kind: VariableValueKind.Null },
              },
            ],
          }
        : {
            kind: EffectExecutionResultKind.Success,
            localPatch:
              request.operation === EffectOperation.MappedSuccess
                ? [
                    {
                      name: "result",
                      value: {
                        kind: VariableValueKind.String,
                        value: "example-result",
                      },
                    },
                  ]
                : [],
          }),
    }),
  ).then(requireCompletedProcessReceipt);
}
