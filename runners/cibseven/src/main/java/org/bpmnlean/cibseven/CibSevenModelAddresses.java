package org.bpmnlean.cibseven;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Objects;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.bpmnlean.cibseven.ScenarioProtocol.SignalRef;
import org.cibseven.bpm.model.bpmn.BpmnModelInstance;
import org.cibseven.bpm.model.bpmn.instance.Message;
import org.cibseven.bpm.model.bpmn.instance.Signal;
import org.w3c.dom.Element;
import org.xml.sax.SAXException;

/**
 * Reads the names a scenario addresses through a deployed model: the root process of a document, a Signal's name from
 * its QName and a Message's name from its id. CIB addresses Signals and Messages by name only, so these are the CIB
 * forms of the scenario contract's identifiers.
 */
final class CibSevenModelAddresses {

  private static final String BPMN_MODEL = "http://www.omg.org/spec/BPMN/20100524/MODEL";

  private CibSevenModelAddresses() {}

  /**
   * The id of the document's root process, by the kernel reader's rule (`selectRootProcess` in
   * `packages/bpmn-source/src/kernel-reader/index.ts`): the first process in document order that no Call Activity of
   * the document names, else the first process. A `calledElement` is an `xsd:QName` (`Semantic.xsd:149`): a prefix
   * resolves through the Call's in-scope declarations and names nothing when unbound, and an unprefixed name takes the
   * Definitions' `targetNamespace`, so a Call of another namespace leaves a same-id process a root (PC-SCOPE-03, R6).
   * CIB's own key-text reading of `calledElement` decides which process a Call runs, never which one is the root.
   */
  static String rootProcessId(byte[] bpmn) {
    var document = parse(bpmn).getDocumentElement();
    var targetNamespace = document.hasAttribute("targetNamespace") ? document.getAttribute("targetNamespace") : null;
    var called = new ArrayList<String>();
    var calls = document.getElementsByTagNameNS(BPMN_MODEL, "callActivity");
    for (var index = 0; index < calls.getLength(); index++) {
      var call = (Element) calls.item(index);
      var value = call.getAttribute("calledElement");
      var separator = value.indexOf(':');
      var namespace = separator < 0 ? targetNamespace : call.lookupNamespaceURI(value.substring(0, separator));
      if (separator >= 0 && namespace == null) {
        continue;
      }
      if (Objects.equals(namespace, targetNamespace)) {
        called.add(value.substring(separator + 1));
      }
    }
    var processes = document.getElementsByTagNameNS(BPMN_MODEL, "process");
    if (processes.getLength() == 0) {
      throw new IllegalStateException("The document declares no process");
    }
    for (var index = 0; index < processes.getLength(); index++) {
      var id = ((Element) processes.item(index)).getAttribute("id");
      if (!called.contains(id)) {
        return id;
      }
    }
    return ((Element) processes.item(0)).getAttribute("id");
  }

  /** The name of the Signal `ref` names in `model`, or null when the model declares no such Signal. */
  static String signalName(BpmnModelInstance model, SignalRef ref) {
    var namespace = model.getDefinitions().getTargetNamespace();
    return model.getModelElementById(ref.id()) instanceof Signal signal && Objects.equals(namespace, ref.namespace())
        ? signal.getName()
        : null;
  }

  /** The name of the Message with id `messageId` in `model`, or null when the model declares none. */
  static String messageName(BpmnModelInstance model, String messageId) {
    return model.getModelElementById(messageId) instanceof Message message ? message.getName() : null;
  }

  /** A namespace-aware DOM of the document, with DTDs and external entities refused. */
  private static org.w3c.dom.Document parse(byte[] bpmn) {
    try {
      var factory = DocumentBuilderFactory.newInstance();
      factory.setNamespaceAware(true);
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      factory.setExpandEntityReferences(false);
      return factory.newDocumentBuilder().parse(new ByteArrayInputStream(bpmn));
    } catch (ParserConfigurationException | SAXException | IOException unreadable) {
      throw new IllegalStateException("The runner cannot read the document's root process", unreadable);
    }
  }
}
