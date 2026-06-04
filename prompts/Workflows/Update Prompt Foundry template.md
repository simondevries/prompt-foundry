{% comment %}
vars:
target_template:
type: promptBlock
label: "Template to improve (e.g., Category: [Category], Name: [name.md])"
{% endcomment %}

<!--
# version: 1.1
# ReferenceLocation: workflow
# Reference: Update the prompt forge block with new information gathered this conversation, as per instructions in "{{blockName}}"
-->

Run a self-improvement loop on the Prompt foundry prompt block {{ target_template}} to improve the context and information in that block with learnings and discoveries from this conversation

## Workflow Steps

0. DO NOT execute the list prompts function. it is not necessary
1. **Read Template:** Read the specific prompt block (`{{ target_template }}`) to understand its current state.
2. **Analyze:** Evaluate how the prompt can be improved (e.g., structural changes, better constraints, fixing liquid syntax). DO NOT ASK USER TO APPROVE CHANGES YET.
3. **Propose Change:** Use the MCP tools (like `propose_prompt_block_edit`) to propose the new version to Prompt Forge. This will return a diff of the changes
4. **Confirm:** Let me know that the proposal is ready and wait for me to confirm the edit in the UI.

## Constraints

- The prompt block is a generic piece of reusable information that can be attached on future conversations. Do not add details that are highly specific to this task
- You MUST use the MCP server tools for proposing changes. Do not just print the markdown in our chat window.
- Unless absolutely necessary, only make incremental changes.
