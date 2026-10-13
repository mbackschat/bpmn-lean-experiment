package org.bpmnlean.cibseven;

import com.fasterxml.jackson.core.JsonParseException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.StreamReadFeature;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ScenarioJson {

  private static final ObjectMapper MAPPER =
      JsonMapper.builder()
          .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
          .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
          .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
          .build();

  private ScenarioJson() {}

  public static ScenarioProtocol.ScenarioDefinition read(Path path) throws IOException {
    return read(Files.readString(path, StandardCharsets.UTF_8));
  }

  public static ScenarioProtocol.ScenarioDefinition read(String json)
      throws JsonProcessingException {
    rejectInvalidWireTokens(json);
    return MAPPER.readValue(json, ScenarioProtocol.ScenarioDefinition.class);
  }

  public static ScenarioProtocol.ScenarioResult readResult(String json)
      throws JsonProcessingException {
    rejectInvalidWireTokens(json);
    return MAPPER.readValue(json, ScenarioProtocol.ScenarioResult.class);
  }

  static int canonicalByteLength(Object value) {
    try {
      return MAPPER.writeValueAsBytes(value).length;
    } catch (JsonProcessingException exception) {
      throw new IllegalArgumentException("wire value cannot be serialized", exception);
    }
  }

  public static ScenarioProtocol.CanonicalResult readEvidenceResult(Path path)
      throws IOException {
    var json = Files.readString(path, StandardCharsets.UTF_8);
    rejectInvalidWireTokens(json);
    var evidence = MAPPER.readTree(json);
    return MAPPER.treeToValue(
        evidence.required("result"),
        ScenarioProtocol.CanonicalResult.class);
  }

  public static String writeScenario(ScenarioProtocol.ScenarioDefinition scenario)
      throws JsonProcessingException {
    return MAPPER.writeValueAsString(scenario);
  }

  public static String write(ScenarioProtocol.ScenarioResult result)
      throws JsonProcessingException {
    return MAPPER.writeValueAsString(result);
  }

  // AA-13 requires lexical admission before Jackson's tree or long coercion can erase spelling.
  private static void rejectInvalidWireTokens(String json)
      throws JsonProcessingException {
    try (var parser = MAPPER.createParser(json)) {
      while (parser.nextToken() != null) {
        switch (parser.currentToken()) {
          case FIELD_NAME, VALUE_STRING -> requireUnicodeScalars(parser.getText(), parser);
          case VALUE_NUMBER_FLOAT -> throw new JsonParseException(
              parser, "wire integers require canonical unsigned decimal digits");
          case VALUE_NUMBER_INT -> {
            var token = parser.getText();
            var maximum = Long.toString(ScenarioProtocol.MAX_SAFE_WIRE_INTEGER);
            if (!token.matches("0|[1-9][0-9]*")
                || token.length() > maximum.length()
                || (token.length() == maximum.length() && token.compareTo(maximum) > 0)) {
              throw new JsonParseException(parser, "wire integer is noncanonical or outside the safe domain");
            }
          }
          default -> {}
        }
      }
    } catch (IOException exception) {
      if (exception instanceof JsonProcessingException processingException) {
        throw processingException;
      }
      throw new IllegalStateException("in-memory JSON scan failed", exception);
    }
  }

  private static void requireUnicodeScalars(String value, com.fasterxml.jackson.core.JsonParser parser)
      throws JsonParseException {
    for (var index = 0; index < value.length(); index++) {
      var unit = value.charAt(index);
      if (Character.isHighSurrogate(unit)) {
        if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
          throw new JsonParseException(parser, "wire strings reject unpaired surrogates");
        }
        index++;
      } else if (Character.isLowSurrogate(unit)) {
        throw new JsonParseException(parser, "wire strings reject unpaired surrogates");
      }
    }
  }
}
