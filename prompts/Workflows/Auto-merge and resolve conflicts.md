{% comment %}
vars:
  target_branch:
    type: text
    label: "Branch to merge (e.g., main or master)"
  strategy:
    type: select
    options: ["merge", "rebase"]
{% endcomment %}
<!-- 
# ReferenceLocation: workflow
# Reference: Execute a git {{ strategy }} workflow from "{{ target_branch }}" as per "{{blockName}}"
-->

Execute a git {{ strategy }} workflow from the `{{ target_branch }}` branch into the current working branch and resolve any conflicts.

## Workflow Steps

1. **Verify State:** Ensure the current branch is clean.
2. **Execute Operation:** Run the git {{ strategy }} command to bring in `{{ target_branch }}`.
3. **Identify Conflicts:** If conflicts occur, use your tools to find all files with git conflict markers.
4. **Resolve Conflicts:** Read the conflicting files, understand the intent of both sides, and implement the correct resolution. ONLY RESOLVE CONFLICTS THAT ARE TRIVIAL. 
5. **Ask user to review and finalize:** For any conflicts that are non-trivial ask the user to review and finalize.
6. **Finalize:** Once all conflicts are cleanly resolved, complete the operation. 

## Constraints
- Do NOT push the changes remotely. Leave the changes locally for my review.
- Do NOT run any git commands aside from git {{ strategy }}
