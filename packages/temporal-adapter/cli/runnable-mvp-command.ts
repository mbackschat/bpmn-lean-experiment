/** Process exit and JSON-lines reporting boundary for the repository MVP command. */
import type { DeepReadonly } from "@bpmn-lean/semantic-core";

import {
  loadRunnableMvpConfig,
} from "./runnable-mvp-config.ts";
import {
  RunnableMvpResultKind,
  runRunnableTemporalMvp,
} from "./runnable-mvp.ts";
import type { RunnableMvpEvent } from "./runnable-mvp.ts";

export const RunnableMvpCommandEventKind = {
  ConfigurationRejected: "configurationRejected",
  InfrastructureFailure: "infrastructureFailure",
} as const;

export type RunnableMvpCommandEvent = DeepReadonly<
  | RunnableMvpEvent
  | {
      kind: typeof RunnableMvpCommandEventKind.ConfigurationRejected;
      evidence: string;
    }
  | {
      kind: typeof RunnableMvpCommandEventKind.InfrastructureFailure;
      address: string;
      evidence: string;
    }
>;

export const RunnableMvpExitCode = {
  Completed: 0,
  InfrastructureFailure: 1,
  AdmissionRejected: 2,
  ExecutionRefused: 3,
  ConfigurationRejected: 64,
} as const;

export async function runRunnableMvpCommand(
  args: ReadonlyArray<string>,
  writeLine: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<number> {
  const operands = args[0] === "--" ? args.slice(1) : args;
  if (operands.length !== 1 || operands[0] === undefined) {
    emit(
      {
        kind: RunnableMvpCommandEventKind.ConfigurationRejected,
        evidence: "usage: pnpm mvp:run -- <config.json>",
      },
      writeLine,
    );
    return RunnableMvpExitCode.ConfigurationRejected;
  }

  let config;
  try {
    config = await loadRunnableMvpConfig(operands[0]);
  } catch (error: unknown) {
    emit(
      {
        kind: RunnableMvpCommandEventKind.ConfigurationRejected,
        evidence: errorMessage(error),
      },
      writeLine,
    );
    return RunnableMvpExitCode.ConfigurationRejected;
  }

  try {
    const result = await runRunnableTemporalMvp(
      config,
      (event) => emit(event, writeLine),
    );
    switch (result.kind) {
      case RunnableMvpResultKind.Completed:
        return RunnableMvpExitCode.Completed;
      case RunnableMvpResultKind.SourceAdmissionRejected:
      case RunnableMvpResultKind.ProcessAdmissionRejected:
        return RunnableMvpExitCode.AdmissionRejected;
      case RunnableMvpResultKind.ActorRefused:
      case RunnableMvpResultKind.CompletionNotCommitted:
        return RunnableMvpExitCode.ExecutionRefused;
    }
    return assertNever(result);
  } catch (error: unknown) {
    emit(
      {
        kind: RunnableMvpCommandEventKind.InfrastructureFailure,
        address: config.temporal.address,
        evidence: errorMessage(error),
      },
      writeLine,
    );
    return RunnableMvpExitCode.InfrastructureFailure;
  }
}

function emit(
  event: RunnableMvpCommandEvent,
  writeLine: (line: string) => void,
): void {
  writeLine(JSON.stringify(event));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return `Unknown failure: ${String(error)}`;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported runnable MVP result: ${String(value)}`);
}
