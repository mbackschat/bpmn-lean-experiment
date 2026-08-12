package org.bpmnlean.cibseven;

import java.util.List;
import java.util.Objects;

/** Neutral immutable User Task assignment and form metadata vocabulary. */
public final class UserTaskMetadataProtocol {

  private UserTaskMetadataProtocol() {}

  public record Candidate(String kind, String id) {
    public Candidate {
      Objects.requireNonNull(kind, "kind");
      Objects.requireNonNull(id, "id");
    }
  }

  public record Assignment(List<Candidate> candidates) {
    public Assignment {
      candidates = List.copyOf(candidates);
    }
  }

  public record FormField(String key, String type) {
    public FormField {
      Objects.requireNonNull(key, "key");
      Objects.requireNonNull(type, "type");
    }
  }

  public record Form(List<FormField> fields) {
    public Form {
      fields = List.copyOf(fields);
    }
  }

  public record UserTaskMetadata(Assignment assignment, Form form) {
    public UserTaskMetadata {
      Objects.requireNonNull(assignment, "assignment");
      Objects.requireNonNull(form, "form");
    }
  }
}
