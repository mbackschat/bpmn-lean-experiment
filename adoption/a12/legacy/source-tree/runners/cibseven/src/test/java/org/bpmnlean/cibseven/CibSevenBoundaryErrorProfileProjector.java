package org.bpmnlean.cibseven;

import java.util.ArrayList;
import javax.xml.parsers.DocumentBuilderFactory;
import org.cibseven.bpm.engine.ProcessEngine;
import org.w3c.dom.Element;

/**
 * Reads the boundary-error phase-zero profile only from the deployed BPMN model.
 *
 * <p>The projector is test infrastructure: its purpose is to prevent a fixture constant from being
 * mistaken for an observed engine/deployment fact.
 */
final class CibSevenBoundaryErrorProfileProjector {

  private static final String BPMN_NAMESPACE =
      "http://www.omg.org/spec/BPMN/20100524/MODEL";
  private static final String CAMUNDA_NAMESPACE =
      "http://camunda.org/schema/1.0/bpmn";

  private CibSevenBoundaryErrorProfileProjector() {}

  static ProfileProjection project(
      ProcessEngine engine, String processDefinitionId) {
    var document = readDeployedModel(engine, processDefinitionId);
    var serviceTask = requireSingle(document, BPMN_NAMESPACE, "serviceTask");
    var boundaryEvent = requireSingle(document, BPMN_NAMESPACE, "boundaryEvent");
    var errorDefinition =
        requireSingle(boundaryEvent, BPMN_NAMESPACE, "errorEventDefinition");
    var error =
        requireById(
            document,
            BPMN_NAMESPACE,
            "error",
            requireAttribute(errorDefinition, null, "errorRef"));
    var input = requireSingle(serviceTask, CAMUNDA_NAMESPACE, "inputParameter");
    var output = requireSingle(serviceTask, CAMUNDA_NAMESPACE, "outputParameter");
    var boundaryOutgoing =
        requireSingle(boundaryEvent, BPMN_NAMESPACE, "outgoing").getTextContent();

    return new ProfileProjection(
        requireAttribute(serviceTask, null, "id"),
        requireAttribute(serviceTask, null, "implementation"),
        requireAttribute(serviceTask, CAMUNDA_NAMESPACE, "delegateExpression"),
        new Mapping(
            requireAttribute(input, null, "name"),
            input.getTextContent()),
        new Mapping(
            requireAttribute(output, null, "name"),
            output.getTextContent()),
        requireAttribute(boundaryEvent, null, "id"),
        requireAttribute(boundaryEvent, null, "name"),
        requireAttribute(boundaryEvent, null, "attachedToRef"),
        boundaryEvent.hasAttribute("cancelActivity")
            ? boundaryEvent.getAttribute("cancelActivity")
            : null,
        requireAttribute(errorDefinition, null, "id"),
        errorDefinition.hasAttributeNS(CAMUNDA_NAMESPACE, "errorCodeVariable")
            ? errorDefinition.getAttributeNS(CAMUNDA_NAMESPACE, "errorCodeVariable")
            : null,
        requireAttribute(error, null, "id"),
        requireAttribute(error, null, "name"),
        requireAttribute(error, null, "errorCode"),
        boundaryOutgoing);
  }

  private static Element readDeployedModel(
      ProcessEngine engine, String processDefinitionId) {
    var factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    try (var source =
        engine.getRepositoryService().getProcessModel(processDefinitionId)) {
      if (source == null) {
        throw new IllegalStateException("Missing deployed BPMN model");
      }
      return factory.newDocumentBuilder().parse(source).getDocumentElement();
    } catch (Exception failure) {
      throw new IllegalStateException(
          "Cannot read deployed boundary-error model", failure);
    }
  }

  private static Element requireSingle(
      Element parent, String namespace, String localName) {
    var elements = parent.getElementsByTagNameNS(namespace, localName);
    if (elements.getLength() != 1) {
      throw new IllegalStateException(
          "Expected one deployed " + localName + ", got " + elements.getLength());
    }
    return (Element) elements.item(0);
  }

  private static Element requireById(
      Element parent, String namespace, String localName, String id) {
    var matches = new ArrayList<Element>();
    var elements = parent.getElementsByTagNameNS(namespace, localName);
    for (var index = 0; index < elements.getLength(); index += 1) {
      var element = (Element) elements.item(index);
      if (id.equals(element.getAttribute("id"))) {
        matches.add(element);
      }
    }
    if (matches.size() != 1) {
      throw new IllegalStateException(
          "Expected one deployed " + localName + " with id " + id);
    }
    return matches.getFirst();
  }

  private static String requireAttribute(
      Element element, String namespace, String localName) {
    var attribute =
        namespace == null
            ? element.getAttributeNode(localName)
            : element.getAttributeNodeNS(namespace, localName);
    if (attribute == null || attribute.getValue().isEmpty()) {
      throw new IllegalStateException(
          "Deployed model is missing attribute " + localName);
    }
    return attribute.getValue();
  }

  record Mapping(String name, String expression) {}

  record ProfileProjection(
      String serviceTaskId,
      String implementation,
      String delegateExpression,
      Mapping inputMapping,
      Mapping outputMapping,
      String boundaryEventId,
      String boundaryEventName,
      String attachedToRef,
      String cancelActivity,
      String errorDefinitionId,
      String errorCodeVariable,
      String errorId,
      String errorName,
      String errorCode,
      String boundaryOutputFlowId) {}
}
