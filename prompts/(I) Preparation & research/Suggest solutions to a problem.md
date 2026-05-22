<!--
# version: 1.0
# ReferenceLocation: workflowBeforeEditing
# Reference: Present solutions to the user before implementing anything, as per "{{blockName}}"
-->

Find and present possible solutions to the problem specified in the main instruction prompt.

## Expectations

- Solutions must adhere to the constraints of the problem.
- Hacky solutions should be labelled as such.
- List each solution with a detailed description.
- Always include one "out of the box" creative solution.
- Always include one solution that works by relaxing one of the constraints (label which constraint).
- If you need more information, stop and ask before listing solutions.

## Constraints

- DO NOT write or modify any code.
- DO NOT begin implementing.

## Output Format

List each solution individually, then provide a summary comparison table:

| Approach | Pros | Cons |
|----------|------|------|
