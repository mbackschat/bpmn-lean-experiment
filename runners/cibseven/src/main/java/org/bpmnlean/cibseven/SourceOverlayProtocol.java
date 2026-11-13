package org.bpmnlean.cibseven;

import java.util.List;
import java.util.Objects;

/**
 * Transport types of the exact source overlay a scenario binds (`contracts/schemas/bpmn-source-overlay.schema.json`),
 * in its closed shape; the runner reads only its effect bindings ({@link CibSevenEffectBindings}).
 */
public final class SourceOverlayProtocol {

  public static final String SOURCE_OVERLAY_KIND = "bpmnSourceOverlay";

  private SourceOverlayProtocol() {}

  public record SourceOverlay(
      String kind,
      String id,
      String semanticProfile,
      List<OverlayEffectBinding> effectBindings,
      List<OverlayInertAttribute> inertAttributes) {
    public SourceOverlay {
      if (!SOURCE_OVERLAY_KIND.equals(kind)) {
        throw new IllegalArgumentException("source overlay kind must be " + SOURCE_OVERLAY_KIND);
      }
      Objects.requireNonNull(id, "id");
      Objects.requireNonNull(semanticProfile, "semanticProfile");
      effectBindings = List.copyOf(effectBindings);
      inertAttributes = List.copyOf(inertAttributes);
    }
  }

  public record OverlayEffectBinding(OverlaySource source, OverlayDescriptor descriptor) {
    public OverlayEffectBinding {
      Objects.requireNonNull(source, "source");
      Objects.requireNonNull(descriptor, "descriptor");
    }
  }

  /** The source attributes a binding matches exactly; `implementation` is null when the source declares none. */
  public record OverlaySource(String implementation, String delegateExpression) {
    public OverlaySource {
      Objects.requireNonNull(delegateExpression, "delegateExpression");
    }
  }

  public record OverlayDescriptor(String protocol, String operation) {
    public OverlayDescriptor {
      Objects.requireNonNull(protocol, "protocol");
      Objects.requireNonNull(operation, "operation");
    }
  }

  public record OverlayInertAttribute(String elementType, OverlayExpandedName expandedName) {}

  public record OverlayExpandedName(String namespaceUri, String localName) {}
}
