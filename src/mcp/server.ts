import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as path from "path";
import { PromptManager } from "../core/promptManager";
import { StyleManager } from "../core/styleManager";
import {
  DEFAULT_PROMPT_BUILDER_DIR,
  getCurrentInstructionPromptFile,
  getStylesFile,
  BUNDLED_CATEGORIES,
} from "../core/constants";
import { SecureFileSystem } from "../core/fs";

// Redirect console.log and console.warn to stderr to avoid breaking the MCP protocol on stdout
console.log = console.error;
console.warn = console.error;

import * as os from "os";

// Get prompt root from environment or use default
let promptRoot = process.env.PROMPT_ROOT || DEFAULT_PROMPT_BUILDER_DIR;
if (promptRoot.startsWith("~")) {
  promptRoot = path.join(os.homedir(), promptRoot.slice(2));
}

// Initialize Secure FS and Core logic
const secureFs = new SecureFileSystem(promptRoot);
const styleManager = new StyleManager(promptRoot, secureFs);
const promptManager = new PromptManager(
  promptRoot,
  styleManager,
  secureFs,
  undefined,
  true, // Enable native watcher for MCP server
);

const server = new Server(
  {
    name: "prompt-forge",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

/**
 * Tool Implementations
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_prompt_blocks",
        description:
          "List all available prompt blocks (categories and prompt block markdown files). Results include a short excerpt from each block to help you identify the right one.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_prompt_block_content",
        description:
          "Get the raw text content of a specific prompt block. Recommendation: use list_prompt_blocks first if you do not know the exact category and filename values to pass here.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "The prompt block category name, as returned by list_prompt_blocks.",
            },
            name: {
              type: "string",
              description:
                "The filename of the prompt block, as returned by list_prompt_blocks.",
            },
          },
          required: ["category", "name"],
        },
      },
      {
        name: "read_main_instruction",
        description:
          "Read the current main instruction/prompt compiled for the AI. This combines the main instruction template with the currently selected active prompt blocks from the user's session.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "propose_prompt_block_edit",
        description:
          "Stage an edit to an EXISTING prompt block file. This is step 1 of a 2-step process — it does NOT write to the file. Use list_prompt_blocks first if you dont already have the exact category and filename. After calling this tool, you MUST ensure the diff from the tool call was displayed. You MUST ALWAYS ask the user 'Do you approve these changes?'. Only call commit_prompt_block_edit (step 2) after the user explicitly says 'yes'.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "The category name of the existing block, as returned by list_prompt_blocks.",
            },
            name: {
              type: "string",
              description:
                "The filename of the existing block, as returned by list_prompt_blocks.",
            },
            content: {
              type: "string",
              description: "The full new content to replace the block with.",
            },
          },
          required: ["category", "name", "content"],
        },
      },
      {
        name: "commit_prompt_block_edit",
        description:
          "Step 2 of editing an existing prompt block. Finalizes and writes the edit staged by propose_prompt_block_edit. ONLY CALL THIS AFTER THE USER HAS EXPLICITLY REPLIED 'YES' TO YOUR PROPOSED DIFF IN THE CHAT. Do not call this speculatively — it permanently overwrites the file.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "The staging ID returned by propose_prompt_block_edit. Required to identify which staged edit to commit.",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "create_prompt_block",
        description:
          "Create a NEW prompt block file. Use this only for files that do not yet exist — for editing existing files use propose_prompt_block_edit instead. Call list_prompt_blocks first to see existing categories and avoid duplicates. The category can be an existing one or a new one (a new folder will be created). The name should be a descriptive filename ending in .md.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "The category (folder) to create the block in. Use an existing category name from list_prompt_blocks, or provide a new name to create a new category.",
            },
            name: {
              type: "string",
              description:
                "The filename for the new block, e.g. 'my-block.md'.",
            },
            content: {
              type: "string",
              description: "The full markdown content of the new block.",
            },
          },
          required: ["category", "name", "content"],
        },
      },
      {
        name: "append_prompt_block",
        description:
          "Append content to an EXISTING prompt block file. Note: This tool will NOT create a new block; the target block must already exist. This tool is ideal for maintaining a persistent 'memory', 'scratchpad', or 'task log' throughout a session.\n\nWHY USE IT: To accumulate research notes, track progress, or store recurring patterns without overwriting previous work. This allows you to have a long-term memory that survives context resets.\nWHEN TO USE: After discovering a new fact, completing a sub-task, or when you want to leave a note for your 'future self' in the next turn.\nEXAMPLE: category='Memory', name='project-notes.md', content='- [Feature X] Found that the database requires a 64-bit integer for the ID field.'",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "The category (folder) where the block is located. Use list_prompt_blocks to find existing categories.",
            },
            name: {
              type: "string",
              description:
                "The filename of the block, e.g. 'task-log.md'. THE BLOCK MUST ALREADY EXIST.",
            },
            content: {
              type: "string",
              description: "The content to append to the end of the file.",
            },
          },
          required: ["category", "name", "content"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_prompt_blocks": {
      const library = promptManager.getPromptLibrary(false);

      const filteredLibrary = library.filter(
        (category) => !BUNDLED_CATEGORIES.includes(category.name),
      );

      const enrichedLibrary = filteredLibrary.map((category) => {
        const {
          style,
          path: categoryPath,
          type,
          isRenameable,
          ...categoryData
        } = category as any;
        return {
          ...categoryData,
          files: category.files.map((fileName: string) => {
            try {
              const content = promptManager.getPromptBlockContent(
                category.name,
                fileName,
              );
              const excerpt =
                content.slice(0, 100).replace(/\n/g, " ") +
                (content.length > 100 ? "..." : "");
              return { name: fileName, excerpt };
            } catch (e) {
              return { name: fileName, excerpt: "(Error reading content)" };
            }
          }),
        };
      });

      return {
        content: [
          { type: "text", text: JSON.stringify(enrichedLibrary, null, 2) },
        ],
      };
    }

    case "get_prompt_block_content": {
      const category = (args as any)?.category;
      const fileName = (args as any)?.name;

      if (typeof category !== "string" || typeof fileName !== "string") {
        throw new Error("Invalid arguments: category and name must be strings");
      }

      if (BUNDLED_CATEGORIES.includes(category)) {
        throw new Error(`Access denied: Category '${category}' is protected.`);
      }

      try {
        const content = promptManager.getPromptBlockContent(category, fileName);
        return {
          content: [{ type: "text", text: content }],
        };
      } catch (e: any) {
        throw new Error(`Failed to get block content: ${e.message}`);
      }
    }

    case "read_main_instruction": {
      const compiled = promptManager.compilePrompt();
      return {
        content: [{ type: "text", text: compiled }],
      };
    }

    /* case "search_prompts": {
      const query = (args as any)?.query;
      if (typeof query !== "string") {
        throw new Error("Invalid arguments: query must be a string");
      }
      const results = promptManager.searchPrompts(query);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    } */

    case "propose_prompt_block_edit": {
      const category = (args as any)?.category;
      const name = (args as any)?.name;
      const content = (args as any)?.content;

      if (typeof category !== "string" || typeof name !== "string") {
        throw new Error("Invalid arguments: category and name must be strings");
      }

      if (BUNDLED_CATEGORIES.includes(category)) {
        throw new Error(`Access denied: Category '${category}' is protected.`);
      }

      try {
        const { id, diffFile } = promptManager.proposeBlock(
          category,
          name,
          content,
        );

        return {
          content: [
            {
              type: "text",
              text: `<MANDATORY_PROTOCOL_STEP>
        ACTION: PRE-COMMIT REVIEW REQUIRED
        ID: ${id}

        INSTRUCTION:
        1. A diff file has been created at: ${diffFile}
        2. You MUST inform the user of the following:
           - A summary of the changes you've staged.
           - The path to the diff file for their reference.
        3. You MUST STOP and ask the user to review and accept the changes via one of these two methods:
           a) Via the Prompt Foundry extension banner (RECOMMENDED: Best for side-by-side diff review).
           b) By asking you to "Commit" directly here in the chat (Only if they are sure).
        4. DO NOT call 'commit_prompt_block_edit' until the user explicitly says "Yes" or "Commit".

        FAILURE TO PROVIDE THE SUMMARY AND OPTIONS IS A PROTOCOL VIOLATION.
        </MANDATORY_PROTOCOL_STEP>`,
            },
          ],
        };
      } catch (e: any) {
        throw new Error(`Failed to stage edit: ${e.message}`);
      }
    }

    case "commit_prompt_block_edit": {
      const id = (args as any)?.id;

      if (typeof id !== "string" || !/^\d+$/.test(id)) {
        throw new Error("Invalid ID: Must be a numeric string.");
      }

      try {
        promptManager.commitBlock(id);
        return {
          content: [
            { type: "text", text: `Successfully committed block edit #${id}.` },
          ],
        };
      } catch (e: any) {
        throw new Error(`Failed to commit edit: ${e.message}`);
      }
    }

    case "create_prompt_block": {
      const category = (args as any)?.category;
      const name = (args as any)?.name;
      const content = (args as any)?.content;

      if (typeof category !== "string" || typeof name !== "string") {
        throw new Error("Invalid arguments: category and name must be strings");
      }

      if (BUNDLED_CATEGORIES.includes(category)) {
        throw new Error(`Access denied: Category '${category}' is protected.`);
      }

      try {
        promptManager.createPromptBlock(category, name, content);
        return {
          content: [
            {
              type: "text",
              text: `Successfully created block ${category}/${name}`,
            },
          ],
        };
      } catch (e: any) {
        throw new Error(`Failed to create block: ${e.message}`);
      }
    }

    case "append_prompt_block": {
      const category = (args as any)?.category;
      const name = (args as any)?.name;
      const content = (args as any)?.content;

      if (typeof category !== "string" || typeof name !== "string") {
        throw new Error("Invalid arguments: category and name must be strings");
      }

      if (BUNDLED_CATEGORIES.includes(category)) {
        throw new Error(`Access denied: Category '${category}' is protected.`);
      }

      try {
        promptManager.appendPromptBlock(category, name, content);
        return {
          content: [
            {
              type: "text",
              text: `Successfully appended to block ${category}/${name}`,
            },
          ],
        };
      } catch (e: any) {
        throw new Error(`Failed to append to block: ${e.message}`);
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

/**
 * Resource Implementations
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "forge://main-instruction",
        name: "Main Instruction",
        description: "The current main instruction template.",
        mimeType: "text/markdown",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === "forge://main-instruction") {
    const compiled = promptManager.compilePrompt();
    return {
      contents: [{ uri, mimeType: "text/markdown", text: compiled }],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Prompt Foundry MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
