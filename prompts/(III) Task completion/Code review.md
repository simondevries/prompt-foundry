{% comment %}
vars:
review_source:
type: select
label: "Code to review"
options: [
"Referenced in prompt: Review files explicitly mentioned in the instructions",
"Current changes: Review only the uncommitted changes in the workspace",
"Changes made this session: Review all work completed during this chat"
]
{% endcomment %}

<!--
# ReferenceLocation: workflowEndOfTask
# Reference: Present a code review report of the {{ review_source }} as per "{{blockName}}"
-->

Review the code (Source: {{ review_source }}) as if reviewing a Pull Request.

## Expectations

- Act as a Senior Engineer reviewing work before it merges.
- Check for architectural flaws, security issues, performance bottlenecks, and style deviations.
- Provide constructive, specific feedback in a bulleted list. Ensure the files are clearly referenced.
- Clearly prefix each comment for example: [nit],[security],[performance],[architecture],[style],[bug]

## Constraints

- DO NOT rewrite the entire file; only point out areas for improvement.
- DO NOT nitpick minor syntax if an automated linter would catch it.
