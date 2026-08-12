import { readFile } from "node:fs/promises";

const metadataSourceUrl = new URL(
  "../../../scenarios/user-task-assignment-form-metadata/process.bpmn",
  import.meta.url,
);
const timerSourceUrl = new URL(
  "../../../scenarios/timer-start-event/process.bpmn",
  import.meta.url,
);
const messageSourceUrl = new URL(
  "../../../scenarios/message-start-event/process.bpmn",
  import.meta.url,
);

export const metadataProfile =
  "cibseven-2.2.0-user-task-assignment-form-metadata-draft";
export const timerProfile = "bpmn-2.0.2-timer-start-event-draft";
export const messageProfile = "bpmn-2.0.2-message-start-event-draft";

export type HumanWorkSources = Readonly<{
  metadata: Uint8Array;
  timer: Uint8Array;
  message: Uint8Array;
}>;

export async function humanWorkSources(token: string): Promise<HumanWorkSources> {
  const [metadata, timer, message] = await Promise.all([
    readFile(metadataSourceUrl, "utf8"),
    readFile(timerSourceUrl, "utf8"),
    readFile(messageSourceUrl, "utf8"),
  ]);
  return {
    metadata: Buffer.from(metadata
      .replaceAll("Definitions_UserTaskMetadata", `Definitions_HumanWork_${token}`)
      .replaceAll("Process_UserTaskMetadata", `Process_HumanWork_${token}`)
      .replace('name="Approve"', `name="Review request ${token}"`)
      .replace(
        "https://bpmn-lean.local/scenarios/user-task-metadata",
        `https://third-party.invalid/human-work/${token}`,
      )),
    timer: Buffer.from(timer
      .replaceAll("Definitions_TimerStart", `Definitions_HumanWork_Timer_${token}`)
      .replaceAll("Process_TimerStart", `Process_HumanWork_Timer_${token}`)
      .replace('name="Review"', `name="Hidden timer task ${token}"`)
      .replace(
        "https://bpmn-lean.local/tests/timer-start",
        `https://third-party.invalid/human-work/timer/${token}`,
      )),
    message: Buffer.from(message
      .replaceAll("Definitions_MessageStart", `Definitions_HumanWork_Message_${token}`)
      .replaceAll("Process_MessageStart", `Process_HumanWork_Message_${token}`)
      .replaceAll(
        "Operation_ReceiveApprovalRequest",
        `Operation_HumanWork_Message_${token}`,
      )
      .replace('name="Approve"', `name="Hidden message task ${token}"`)
      .replace(
        "https://bpmn-lean.local/tests/message-start",
        `https://third-party.invalid/human-work/message/${token}`,
      )),
  };
}
