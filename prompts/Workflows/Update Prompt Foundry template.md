
{% comment %}
vars:
  target_template:
    type: promptBlock
    label: "Template to improve (e.g., Category: [Category], Name: [name.md])"
{% endcomment %}
<!-- 
# ReferenceLocation: workflow
# Reference: Run a self-improvement loop on the "{{ target_template }}" template as per "{{blockName}}"

# Goal: Improve Prompt Forge Template
-->

Run a self-improvement loop to review and enhance a Prompt Sandbox template.

## Workflow Steps

0. DO NOT execute the list prompts function. it is not necessary
1. **Read Template:** Read the specific prompt block (`{{ target_template }}`) to understand its current state.
2. **Analyze:** Evaluate how the prompt can be improved (e.g., structural changes, better constraints, fixing liquid syntax). DO NOT ASK USER TO APPROVE CHANGES YET.
3. **Propose Change:** Use the MCP tools (like `propose_prompt_block_edit`) to propose the new version to Prompt Forge. This will return a diff of the changes
4. **Confirm:** Let me know that the proposal is ready and wait for me to confirm the edit in the UI.

## Constraints
- You MUST use the MCP server tools for proposing changes. Do not just print the markdown in our chat window.
- Ensure the modified template strictly follows the standard prompt architecture (Goal, Expectations, Constraints).
