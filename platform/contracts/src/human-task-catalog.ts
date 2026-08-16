import type { DeepReadonly } from "@bpmn-lean/contract-types";

export const humanTaskCatalogSchemaVersion =
  "bpmn-lean-human-task-catalog/v1" as const;
export const structuredFormSchemaVersion =
  "bpmn-lean-structured-form/v1" as const;

export const ResolutionActionIntent = {
  Primary: "primary",
  Neutral: "neutral",
  Destructive: "destructive",
} as const;

export type ResolutionActionIntent =
  typeof ResolutionActionIntent[keyof typeof ResolutionActionIntent];

export type ChoiceOptionV1 = DeepReadonly<{
  value: string;
  label: string;
}>;

export type ResolutionActionV1 = DeepReadonly<{
  id: string;
  label: string;
  intent: ResolutionActionIntent;
  resolutionValue: string;
}>;

type StructuredFieldBaseV1<Kind extends string, Default> = {
  kind: Kind;
  key: string;
  label: string;
  helpText: string | null;
  defaultValue: Default | null;
  visibleForActions: "all" | string[];
  requiredForActions: string[];
};

export type StructuredTextFieldV1 = DeepReadonly<
  StructuredFieldBaseV1<"text", string> & {
    multiline: boolean;
    minLength: number;
    maxLength: number;
  }
>;

export type StructuredBooleanFieldV1 = DeepReadonly<
  StructuredFieldBaseV1<"boolean", boolean>
>;

export type StructuredIntegerFieldV1 = DeepReadonly<
  StructuredFieldBaseV1<"integer", number> & {
    minimum: number;
    maximum: number;
  }
>;

export type StructuredDateFieldV1 = DeepReadonly<
  StructuredFieldBaseV1<"date", string>
>;

export type StructuredSingleChoiceFieldV1 = DeepReadonly<
  StructuredFieldBaseV1<"singleChoice", string> & {
    options: ChoiceOptionV1[];
  }
>;

export type StructuredMultipleChoiceFieldV1 = DeepReadonly<
  StructuredFieldBaseV1<"multipleChoice", string[]> & {
    options: ChoiceOptionV1[];
    maxItems: number;
  }
>;

export type StructuredFieldV1 =
  | StructuredTextFieldV1
  | StructuredBooleanFieldV1
  | StructuredIntegerFieldV1
  | StructuredDateFieldV1
  | StructuredSingleChoiceFieldV1
  | StructuredMultipleChoiceFieldV1;

export type StructuredFormDefinitionV1 = DeepReadonly<{
  schemaVersion: typeof structuredFormSchemaVersion;
  fields: StructuredFieldV1[];
  actions: ResolutionActionV1[];
  resolutionVariable: string;
}>;

export type HumanTaskDefinitionV1 = DeepReadonly<{
  elementId: string;
  description: string;
  worklistPriority: number;
  form: StructuredFormDefinitionV1;
}>;

export type HumanTaskCatalogV1 = DeepReadonly<{
  schemaVersion: typeof humanTaskCatalogSchemaVersion;
  processId: string;
  semanticProfile: string;
  sourceSha256: string;
  tasks: HumanTaskDefinitionV1[];
}>;
