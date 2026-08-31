import type { DeepReadonly } from "./deep-readonly.js";

/** The deliberately closed path language selected by the Message key-correlation profile. */
export const CorrelationScalarPathLanguage =
  "urn:bpmn-lean:correlation-scalar-path:v1" as const;

export type CorrelationMessagePath = DeepReadonly<{
  language: typeof CorrelationScalarPathLanguage;
  body: "payload";
}>;

export type CorrelationProcessPropertyPath = DeepReadonly<{
  language: typeof CorrelationScalarPathLanguage;
  body: string;
  propertyId: string;
}>;
