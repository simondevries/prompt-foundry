<!--
# ReferenceLocation: workflowBeforeEditing
# Reference: Write a step-by-step implementation plan before writing any code, as per "{{blockName}}"
-->

Write a step-by-step implementation plan for the discussed solution. Use the built in features for making plans.
Your plan will be implemented by another agent which may be less powerful than you. Provide very details instructions to ensure the other agent can complete the task successfully.

## Expectations

Includes real code block that the subagent can implement directly, not just pseudo code.
If tests are usually written, then list of test cases or provide code blocks for the tests.
Since these requirements might require a very verbose plan, break it into multiple steps with clear headings and subheadings OR make a separate plan for each major step or file of the implementation.
Include a "Risks" section at the bottom with the main drawbacks of this solution.
Include required dependencies.
Include pseudo code examples where helpful.

## Constraints

- **NO EXECUTION:** Do not write any implementation code. Wait for explicit "Approve" before proceeding.
