{% comment %}
vars:
  refactor_type:
    type: select
    options: [
      "Concise: Minimize boilerplate using modern syntax features",
      "Comments: Strip redundant comments; retain only 'why' logic",
      "Naming: Use descriptive, domain-specific names for all symbols",
      "DRY: Abstract repetitive logic into reusable functions/utilities",
      "Readability: Optimize code flow and spacing for human scannability",
      "Errors: Implement robust, graceful error handling for all edge cases",
      "Performance: Optimize resource usage and eliminate execution bottlenecks",
      "Single responsibility: Split the specified functions/files into single-responsibility units. Keep logic the same. Use plan mode if large refactor.",
      "Open/closed principle: Design your logic to rely on abstractions or interfaces so that you can add new features by creating new classes rather than modifying existing, tested source code.",
      "Liskov substitution principle: Ensure every subclass adheres to the behavior and contracts of its parent so that any instance of the parent can be replaced by a child without the calling code ever knowing or failing.",
      "Dependency inversion principle: Remove hard-coded dependencies by requiring interfaces in your constructors, allowing high-level logic to remain independent of the specific low-level tools it uses.",
      "Interface segregation principle: Decompose large interfaces into small, specific sets of methods so that implementing classes are never forced to provide logic for functions they do not require.",
    ]
{% endcomment %}
<!-- 
# ReferenceLocation: workflowBeforeEditing
# Reference: Refactor the code according to the "{{ refactor_type }}" type as per "{{blockName}}"

# Goal: The code has been refactored by the end of the task
-->
Refactor the code referenced in the main instruction prompt.

## Refactor Type: {{ refactor_type }}

## Expectations
- Preserve all existing functionality — no behaviour changes.
- Stay focused on the selected refactor type; do not mix concerns.
- If existing tests are present, they must still pass after the refactor.

## Constraints
- Flag any areas where behaviour is ambiguous before changing them.
