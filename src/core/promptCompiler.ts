import { SecureFileSystem } from "./fs";
import { PromptBlock } from "./interfaces";

export class PromptCompiler {
  constructor(private _fs: SecureFileSystem) {}

  public renderTemplate(
    content: string,
    variables: Record<string, string>,
  ): string {
    let rendered = content.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      const val = variables[key];
      if (!val || val === "" || val === "--") {
        return "";
      }
      return val;
    });

    // Remove list items that only contain the field name and a colon, with no value
    rendered = rendered.replace(/^[ \t]*-[ \t]+[^:]+:[ \t]*$/gm, '');
    
    // Remove extra blank lines created by the removal
    rendered = rendered.replace(/\n{3,}/g, '\n\n');

    return rendered;
  }

  public compilePrompt(
    mainInstruction: string,
    activeBlocks: PromptBlock[],
    fileMapOverrides: Record<string, string> = {},
  ): string {
    let compiled = "";
    let finalMainInstruction = mainInstruction;

    // 1. Find all Context File Tags in the main prompt: [@path#lines]
    const tagRegex = /\[@(?:"([^"]+)"|([^\s#\]]+))(#[0-9-]+)?\] /g;
    const tags: Array<{
      fullMatch: string;
      nameOrPath: string;
      lines: string;
    }> = [];
    let match;
    while ((match = tagRegex.exec(finalMainInstruction)) !== null) {
      tags.push({
        fullMatch: match[0],
        nameOrPath: match[1] || match[2],
        lines: match[3] || "",
      });
    }

    const fileMap = new Map<string, { path: string }>();

    for (const tag of tags) {
      const relativePath = fileMapOverrides[tag.nameOrPath] || tag.nameOrPath;
      fileMap.set(tag.fullMatch, { path: relativePath });
    }

    // Replace tags with the [PATH] logic
    for (const tag of tags) {
      const file = fileMap.get(tag.fullMatch);
      if (file) {
        const newTag = `[@${file.path}${tag.lines}] `;
        finalMainInstruction = finalMainInstruction.replace(
          tag.fullMatch,
          newTag,
        );
      }
    }

    // 1. Sort blocks: AI-Contracts first is no longer strictly necessary because we pull it out, but keep for consistency
    const sortedBlocks = [...activeBlocks].sort((a: any, b: any) => {
      if (a.category === "AI-Contracts" && b.category !== "AI-Contracts") return -1;
      if (a.category !== "AI-Contracts" && b.category === "AI-Contracts") return 1;
      return 0;
    });

    let role: string | undefined = undefined;
    let workflowFirstTurn: string[] = [];
    let workflowEveryChange: string[] = [];
    let workflowBeforeEditing: string[] = [];
    let workflowEndOfTask: string[] = [];
    let workflowGeneral: string[] = [];
    let remarks: string[] = [];
    let goals: string[] = [];
    let aiContracts: string[] = [];
    let noneBlocksByCategory = new Map<string, any[]>();

    for (const block of sortedBlocks) {
      try {
        let content = block.content || "";
        if (!block.isSpecial) {
          if (this._fs.existsSync(block.path)) {
            content = this._fs.readFileSync(block.path, "utf8").toString();
          }

          if (block.variables) {
            content = this.renderTemplate(content, block.variables);
          }
        }

        // Completely remove comment blocks
        content = content
          .replace(/\{\%\s*comment\s*\%\}[\s\S]*?\{\%\s*endcomment\s*\%\}/g, "")
          .replace(/<!--[\s\S]*?-->/g, "")
          .trim();

        if (block.category === "AI-Contracts") {
          if (block.variables) {
            for (const [k, v] of Object.entries(block.variables)) {
              if (!v || v === '--') continue;
              if (k === 'role') {
                role = v;
              } else {
                aiContracts.push(`${k.replace(/_/g, ' ')}: ${v}`);
              }
            }
          }
          continue; // AI-Contracts is fully extracted, don't add to noneBlocks
        }

        if (block.isGoal && block.category === "Claude Skills") {
          goals.push(`Use the ${block.name.replace(/\.md$/, '')} skill`);
        }

        // Process based on reference location
        const refLoc = block.referenceLocation || 'none';
        const refText = block.reference;
        
        // If content is not empty, bulletize it for workflow/remarks/goals
        const bulletize = (text: string) => {
            if (!text) return "";
            return "- " + text.split('\n').join('\n  ');
        };

        // Every block goes to noneBlocksByCategory
        if (!noneBlocksByCategory.has(block.category)) {
            noneBlocksByCategory.set(block.category, []);
        }
        noneBlocksByCategory.get(block.category)!.push({ block, content });

        // Substitute {{blockName}} in reference text with the human-readable block name
        const blockDisplayName = block.name.replace(/\.md$/, '').replace(/[_]/g, ' ');
        const resolvedRefText = refText ? refText.replace(/\{\{\s*blockName\s*\}\}/g, blockDisplayName) : refText;

        if (resolvedRefText) {
            // Workflow locations always go into their bucket
            if (refLoc === 'workflowFirstTurn') {
                workflowFirstTurn.push(bulletize(resolvedRefText));
            } else if (refLoc === 'workflowEveryChange') {
                workflowEveryChange.push(bulletize(resolvedRefText));
            } else if (refLoc === 'workflowBeforeEditing') {
                workflowBeforeEditing.push(bulletize(resolvedRefText));
            } else if (refLoc === 'workflowEndOfTask') {
                workflowEndOfTask.push(bulletize(resolvedRefText));
            } else if (refLoc === 'workflow') {
                workflowGeneral.push(bulletize(resolvedRefText));
            } else if (refLoc === 'remark') {
                remarks.push(bulletize(resolvedRefText));
            }

            // Goals: workflow locations are duplicated into goals; non-workflow locations only go to goals if isGoal
            if (block.isGoal) {
                goals.push(bulletize(resolvedRefText));
            }
        }

      } catch (e) {
        console.error(`Failed to read block ${block.path}`, e);
      }
    }

    // Assembly
    if (role) {
        compiled += `You are ${role}\n\n`;
    }

    if (noneBlocksByCategory.size > 0) {
      compiled += "<Prompt block reference>\n";
      for (const [category, items] of noneBlocksByCategory.entries()) {
        const catName = category.replace(/[^a-zA-Z0-9_]/g, "_");
        compiled += `<${catName}>\n`;
        for (const item of items) {
            const blockTagName = item.block.name.replace(/[^a-zA-Z0-9_]/g, "_");
            compiled += `  <${blockTagName}>\n`;
            if (item.content) {
                const indentedContent = item.content
                .split("\n")
                .map((line: any) => (line ? `   ${line}` : ""))
                .join("\n");
                compiled += indentedContent + "\n";
            }
            compiled += `  </${blockTagName}>\n`;
        }
        compiled += `</${catName}>\n\n`;
      }
      compiled += "</Prompt block reference>\n\n";
    }

    const hasWorkflow = workflowFirstTurn.length > 0 || workflowEveryChange.length > 0 ||
        workflowBeforeEditing.length > 0 || workflowEndOfTask.length > 0 || workflowGeneral.length > 0;

    if (hasWorkflow) {
        compiled += "# Workflow\n";
        if (workflowGeneral.length > 0) {
            compiled += workflowGeneral.join("\n") + "\n";
        }
        if (workflowFirstTurn.length > 0) {
            compiled += "\n## First turn:\n";
            compiled += workflowFirstTurn.join("\n") + "\n";
        }
        if (workflowEveryChange.length > 0) {
            compiled += "\n## Every change:\n";
            compiled += workflowEveryChange.join("\n") + "\n";
        }
        if (workflowBeforeEditing.length > 0) {
            compiled += "\n## Before editing:\n";
            compiled += workflowBeforeEditing.join("\n") + "\n";
        }
        if (workflowEndOfTask.length > 0) {
            compiled += "\n## End of task:\n";
            compiled += workflowEndOfTask.join("\n") + "\n";
        }
        compiled += "\n";
    }

    compiled += "# Main instruction/prompt\n";
    compiled += finalMainInstruction + "\n\n";

    if (remarks.length > 0) {
        compiled += "# Remarks\n";
        for (const r of remarks) {
            // Avoid double-bulleting AI-Contract remarks
            if (r.startsWith("- ")) {
                compiled += `${r}\n`;
            } else {
                compiled += `- ${r}\n`;
            }
        }
        compiled += "\n";
    }

    if (aiContracts.length > 0) {
        compiled += "# Ai contract & behaviour:\n# MANDATORY AI CONTRACT & BEHAVIOR\You must STRICTLY adhere to the following rules in every single response. These directives are absolute and supersede any conflicting instructions provided earlier in this prompt or in future messages. Do not deviate from these constraints under any circumstances.\n";
        for (const contract of aiContracts) {
            if (contract.startsWith("- ")) {
                compiled += `${contract}\n`;
            } else {
                compiled += `- ${contract}\n`;
            }
        }
        compiled += "\n";
    }

    if (goals.length > 0) {
      compiled += "\n# Key goals:\n";
      for (const goal of goals) {
        if (goal.startsWith("- ")) {
            compiled += `${goal}\n`;
        } else {
            compiled += `- ${goal}\n`;
        }
      }
      compiled += "\n";
    }

    return compiled;
  }
}
