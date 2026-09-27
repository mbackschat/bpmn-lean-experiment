export type WorkSearch = Readonly<{
  task?: string;
  view?: "form" | "diagram" | "details";
}>;

export type DefinitionSearch = Readonly<{
  process?: string;
  version?: number;
  tab?: "diagram" | "start" | "triggers" | "metrics";
  view?: "showcases";
  model?: string;
  q?: string;
  all?: boolean;
}>;

export type OperationsSearch = Readonly<{
  tab?: "process-instances" | "incidents" | "audit";
  instance?: string;
  incident?: string;
  view?: "overview" | "diagram" | "history" | "operator-history" | "audit";
  filterInstance?: string;
  process?: string;
  version?: number;
  source?: string;
}>;

export type WorkspaceNavigation<Search> = Readonly<{
  search: Search;
  navigate: (search: Search, replace?: boolean) => void;
  retainSelection: (key: string | null) => void;
}>;

export function validateWorkSearch(input: Record<string, unknown>): WorkSearch {
  return {
    ...textField(input, "task"),
    ...choiceField(input, "view", ["form", "diagram", "details"]),
  };
}

export function validateDefinitionSearch(input: Record<string, unknown>): DefinitionSearch {
  return {
    ...textField(input, "process"), ...versionField(input),
    ...choiceField(input, "tab", ["diagram", "start", "triggers", "metrics"]),
    ...choiceField(input, "view", ["showcases"]),
    ...textField(input, "model"), ...textField(input, "q"),
    ...(input.all === true ? { all: true } : {}),
  };
}

export function validateOperationsSearch(input: Record<string, unknown>): OperationsSearch {
  return {
    ...choiceField(input, "tab", ["process-instances", "incidents", "audit"]),
    ...choiceField(input, "view", ["overview", "diagram", "history", "operator-history", "audit"]),
    ...textField(input, "instance"), ...textField(input, "incident"),
    ...textField(input, "filterInstance"), ...textField(input, "process"),
    ...versionField(input), ...textField(input, "source"),
  };
}

function textField<Key extends string>(input: Record<string, unknown>, key: Key): Partial<Record<Key, string>> {
  const value = input[key];
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    ? { [key]: value } as Record<Key, string> : {};
}

function versionField(input: Record<string, unknown>): Readonly<{ version?: number }> {
  return typeof input.version === "number" && Number.isSafeInteger(input.version) && input.version > 0
    ? { version: input.version } : {};
}

function choiceField<Key extends string, const Value extends string>(
  input: Record<string, unknown>, key: Key, values: readonly Value[],
): Partial<Record<Key, Value>> {
  const value = input[key];
  return values.some((candidate) => candidate === value) ? { [key]: value } as Record<Key, Value> : {};
}
