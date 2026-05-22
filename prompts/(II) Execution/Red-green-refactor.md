<!-- 
# version: 1.0
# ReferenceLocation: workflowEveryChange
# Reference: Follow the Red-Green-Refactor TDD cycle as per "{{blockName}}"

# Goal: All phases of TDD executed in order. Failed tests, passing tests, refactored code.
-->
Follow TDD to implement the feature or fix described in the main instruction prompt.

## Expectations
- **Red:** Write a failing test first that describes the expected behaviour.
- **Green:** Write the minimum code required to make the test pass.
- **Refactor:** Clean up the code without breaking the tests.
- Work through each step explicitly; do not skip ahead.
- **Review** How good quality are the tests? Can the number of tests be reduced or tests merged? Do the tests cover the proper surface area or are they just testing mocks?

## Constraints
- DO NOT write implementation code before the failing test exists.
- Each step must be followed one by one.
- Review of the test must be printed to the user before the next step is taken
