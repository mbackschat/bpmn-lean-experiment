const privateFactKeys = new Set([
  "activityattempt",
  "cause",
  "commandtransportpayload",
  "eventhistory",
  "exception",
  "history",
  "locator",
  "retrycount",
  "runid",
  "stack",
  "stacktrace",
  "stimulus",
  "taskqueue",
  "transportcommandpayload",
  "workflowid",
]);

export function privateFactPaths(value: unknown): string[] {
  const findings: string[] = [];
  inspect(value, "$", findings, new Set<object>());
  return findings;
}

function inspect(
  value: unknown,
  path: string,
  findings: string[],
  visited: Set<object>,
): void {
  if (typeof value === "string") {
    if (containsPrivateFactText(value)) findings.push(path);
    return;
  }
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((member, index) => inspect(member, `${path}[${index}]`, findings, visited));
    return;
  }
  for (const [key, member] of Object.entries(value)) {
    const memberPath = `${path}.${key}`;
    if (isPrivateFactKey(key)) findings.push(memberPath);
    inspect(member, memberPath, findings, visited);
  }
}

function isPrivateFactKey(key: string): boolean {
  return privateFactKeys.has(key.replaceAll(/[-_\s]/gu, "").toLowerCase());
}

function containsPrivateFactText(value: string): boolean {
  return /(?:bpmn-(?:definition-schedule|direct-start|process)-sha256:|activity attempt|command transport payload|event history|process work locator|retry count|run id|stack trace|task queue|transport command payload|workflow id)/iu.test(
    value,
  );
}
