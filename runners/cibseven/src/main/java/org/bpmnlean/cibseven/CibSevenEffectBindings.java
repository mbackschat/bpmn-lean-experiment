package org.bpmnlean.cibseven;

import com.fasterxml.jackson.core.JsonProcessingException;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import org.bpmnlean.cibseven.ScenarioProtocol.SourceOverlayIdentity;
import org.bpmnlean.cibseven.SourceOverlayProtocol.OverlayEffectBinding;

/**
 * The effect bindings one scenario's model may select: the built-in delegate tokens of
 * {@link CibSevenScriptedEffect#HANDLER_BEANS} and those the scenario's exact source overlay declares, as the kernel
 * reader matches them (`kernel-reader/binding.ts#boundBy`: overlay bindings first, by exact `implementation` and
 * `delegateExpression`). Every declared token is answered by the one scripted effect, so the scenario's
 * `effectResult` stimuli decide each result and no handler name selects behavior.
 *
 * <p>A token neither declares stays unresolvable in CIB. An asynchronous task the built-in probe protocol names still
 * waits at its job, which CIB fails when it resolves the token (CIB-LIM-0051); any other unbound task has no effect
 * descriptor to publish, so its projection is a harness failure.
 */
final class CibSevenEffectBindings {

  /** The bindings of a scenario that binds no source overlay. */
  static final CibSevenEffectBindings BUILT_IN = new CibSevenEffectBindings(null, List.of());

  /** One bean-token reference, the only delegate expression a declared token can be registered under. */
  private static final Pattern BEAN_TOKEN = Pattern.compile("[$#]\\{([A-Za-z_][A-Za-z0-9_]*)\\}");

  private final SourceOverlayIdentity overlay;
  private final List<Declared> declared;

  private CibSevenEffectBindings(SourceOverlayIdentity overlay, List<Declared> declared) {
    this.overlay = overlay;
    this.declared = List.copyOf(declared);
  }

  /**
   * The bindings of the overlay {@code identity} names, read from its exact bytes; the caller has verified their
   * digest. An overlay with another id, or one that binds a delegate expression other than one bean token, is refused.
   */
  static CibSevenEffectBindings read(SourceOverlayIdentity identity, String json) throws JsonProcessingException {
    Objects.requireNonNull(identity, "identity");
    var overlay = ScenarioJson.readOverlay(json);
    if (!overlay.id().equals(identity.id())) {
      throw new IllegalArgumentException(
          "Source overlay " + identity.sha256() + " is " + overlay.id() + ", not " + identity.id());
    }
    return new CibSevenEffectBindings(
        identity, overlay.effectBindings().stream().map(CibSevenEffectBindings::declare).toList());
  }

  /**
   * The bindings every definition of a population shares. One engine registers one set of beans, so definitions that
   * bind different overlays, or an overlay and none, would let one definition resolve a token only another declares.
   */
  static CibSevenEffectBindings shared(Collection<CibSevenEffectBindings> definitions) {
    var distinct = definitions.stream().map(bindings -> bindings.overlay).distinct().toList();
    if (distinct.size() > 1) {
      throw new IllegalStateException("Definitions that bind different source overlays have no realization");
    }
    return definitions.stream().findFirst().orElse(BUILT_IN);
  }

  /** The bean tokens the engine resolves for this scenario: the built-in ones, then each the overlay declares. */
  List<String> handlerTokens() {
    var tokens = new LinkedHashSet<>(CibSevenScriptedEffect.HANDLER_BEANS);
    declared.forEach(binding -> tokens.add(binding.token()));
    return List.copyOf(tokens);
  }

  /** The effect an asynchronous Service or Send Task publishes while its job waits. */
  BoundEffect effect(String taskId, String implementation, String delegateExpression) {
    for (var binding : declared) {
      if (Objects.equals(binding.implementation(), implementation)
          && binding.delegateExpression().equals(delegateExpression)) {
        return new BoundEffect(binding.token(), binding.protocol(), binding.operation());
      }
    }
    if (!CibSevenScriptedEffect.SOURCE_PROTOCOL.equals(implementation)) {
      throw new IllegalStateException("Task " + taskId + " has no effect binding in this runner");
    }
    return new BoundEffect(
        builtInToken(delegateExpression), CibSevenScriptedEffect.EFFECT_PROTOCOL,
        CibSevenScriptedEffect.EFFECT_OPERATION);
  }

  private static Declared declare(OverlayEffectBinding binding) {
    var expression = binding.source().delegateExpression();
    var token = BEAN_TOKEN.matcher(expression);
    if (!token.matches()) {
      throw new IllegalArgumentException(
          "Source overlay binds " + expression + ", which is not one bean-token reference");
    }
    return new Declared(
        binding.source().implementation(), expression, token.group(1), binding.descriptor().protocol(),
        binding.descriptor().operation());
  }

  private static String builtInToken(String delegateExpression) {
    if (delegateExpression == null
        || !delegateExpression.startsWith("${")
        || !delegateExpression.endsWith("}")
        || delegateExpression.length() <= 3) {
      throw new IllegalStateException("Delegate expression is not one exact bean-token reference");
    }
    return delegateExpression.substring(2, delegateExpression.length() - 1);
  }

  /** The handler token an effect job records and the neutral descriptor its wait publishes. */
  record BoundEffect(String handler, String protocol, String operation) {}

  private record Declared(
      String implementation, String delegateExpression, String token, String protocol, String operation) {}
}
