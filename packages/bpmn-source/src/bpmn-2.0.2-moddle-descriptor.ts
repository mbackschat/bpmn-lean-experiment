import upstreamBpmnModdle from "bpmn-moddle/resources/bpmn/json/bpmn.json" with {
  type: "json",
};

type ModdleProperty = Readonly<Record<string, unknown>> & Readonly<{
  name: string;
}>;

type ModdleType = Readonly<Record<string, unknown>> & Readonly<{
  name: string;
  properties?: ReadonlyArray<ModdleProperty>;
}>;

type ModdlePackage = Readonly<Record<string, unknown>> & Readonly<{
  types: ReadonlyArray<ModdleType>;
}>;

/**
 * The pinned parser descriptor with the BPMN 2.0.2 Conversation QName property corrected.
 *
 * BPMN 2.0.2 `Semantic.xsd` declares singular `tConversationNode/messageFlowRef`; the bundled
 * `bpmn-moddle@10.0.0` descriptor instead names `messageFlowRefs`, so `moddle-xml` cannot match the
 * schema-defined child element and discards it with a warning. Replacing that one property name
 * preserves the upstream descriptor as the source while restoring the standard parser graph.
 */
export const bpmn202ModdleDescriptor = correctConversationMessageFlowRef(
  upstreamBpmnModdle,
);

function correctConversationMessageFlowRef(
  descriptor: ModdlePackage,
): ModdlePackage {
  let corrections = 0;
  const types = descriptor.types.map((type) => {
    if (type.name !== "ConversationNode" || type.properties === undefined) {
      return type;
    }
    const properties = type.properties.map((property) => {
      if (property.name !== "messageFlowRefs") {
        return property;
      }
      corrections += 1;
      return { ...property, name: "messageFlowRef" };
    });
    return { ...type, properties };
  });
  if (corrections !== 1) {
    throw new TypeError(
      "the pinned BPMN moddle descriptor does not contain exactly one ConversationNode.messageFlowRefs property",
    );
  }
  return { ...descriptor, types };
}
