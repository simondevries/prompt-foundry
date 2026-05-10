import React from "react";
import { IconButton } from "../components/Common";
import { Category, Block } from "../types";
import { SPECIAL_TOOLS } from "../../core/tools";

interface PromptBlocksPanelProps {
  library: Category[];
  selectedCategoryName: string | null;
  activeBlocks: Block[];
  onSelectCategory: (category: string | null) => void;
  onAddBlock: (category: string, file: string, path: string) => void;
  onEditBlock: (path: string) => void;
  onDeleteBlock: (path: string, name: string) => void;
  onAddSpecial: (type: string) => void;
  onCreateCategory: () => void;
  onRenameCategory: (name: string) => void;
  onCreateBlock: (category: string) => void;
  onMoveBlock: (path: string) => void;
  searchQuery?: string;
}

const PromptBlocksPanel: React.FC<PromptBlocksPanelProps> = ({
  library,
  selectedCategoryName,
  activeBlocks,
  onSelectCategory,
  onAddBlock,
  onEditBlock,
  onDeleteBlock,
  onAddSpecial,
  onCreateCategory,
  onRenameCategory,
  onCreateBlock,
  onMoveBlock,
  searchQuery = "",
}) => {
  const query = searchQuery.toLowerCase().trim();

  // Handle Search Result Flattening
  if (query) {
    const searchResults: Array<{
      category: string;
      file: string;
      path: string;
    }> = [];
    library.forEach((cat) => {
      cat.files.forEach((file) => {
        if (file.toLowerCase().includes(query)) {
          searchResults.push({
            category: cat.name,
            file,
            path: cat.path + "/" + file,
          });
        }
      });
    });

    return (
      <div id="searchView">
        <ul className="block-list">
          <li
            className="list-item"
            style={{
              opacity: 0.5,
              fontSize: "0.9em",
              borderBottom: "1px solid var(--vscode-widget-border)",
              marginBottom: "4px",
            }}
          >
            Found {searchResults.length} matches
          </li>
          {searchResults.map((res) => {
            const isActive = (activeBlocks || []).find(
              (b) => b.name === res.file && b.category === res.category,
            );
            if (isActive) return null;

            return (
              <li
                key={res.path}
                className="list-item add-block-item"
                onClick={() => onAddBlock(res.category, res.file, res.path)}
              >
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span>{res.file.includes('/') ? `[${res.file.split('/')[0]}] ${res.file.split('/').pop()}` : res.file}</span>
                  <span style={{ fontSize: "0.75em", opacity: 0.5 }}>
                    in {res.category}
                  </span>
                </div>
                <div className="actions">
                  <IconButton
                    icon="edit"
                    title="Edit Block"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditBlock(res.path);
                    }}
                  />
                  {!["Claude Skills", "Claude Commands", "Cursor"].includes(
                    res.category,
                  ) && (
                    <IconButton
                      icon="folder"
                      title="Move to Folder"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveBlock(res.path);
                      }}
                    />
                  )}
                  {!["Claude Skills", "Claude Commands", "Cursor"].includes(
                    res.category,
                  ) && (
                    <IconButton
                      icon="trash"
                      title="Delete Block"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBlock(res.path, res.file);
                      }}
                    />
                  )}
                  <IconButton icon="add" title="Add" onClick={() => {}} />
                </div>
              </li>
            );
          })}
          {searchResults.length === 0 && (
            <li
              className="list-item"
              style={{ opacity: 0.5, textAlign: "center", padding: "20px" }}
            >
              No matches found.
            </li>
          )}
        </ul>
      </div>
    );
  }

  if (selectedCategoryName) {
    const category = library.find((c) => c.name === selectedCategoryName);

    return (
      <div id="blockView">
        <ul id="blockList" className="block-list">
          <li
            className="list-item back-to-blocks-btn"
            style={{
              opacity: 0.7,
              borderBottom: "1px solid var(--vscode-widget-border)",
              marginBottom: "5px",
            }}
            onClick={() => onSelectCategory(null)}
          >
            <span>
              <span className="codicon codicon-chevron-left"></span> Back to
              Blocks
            </span>
          </li>

          {selectedCategoryName === "Tools" &&
            SPECIAL_TOOLS.map((tool) => (
              <li
                key={tool.id}
                className="list-item special-block-item"
                onClick={() => onAddSpecial(tool.id)}
              >
                <span>
                  <span className={`codicon codicon-${tool.icon}`}></span>{" "}
                  {tool.displayName}
                </span>
              </li>
            ))}

          {![
            "Tools",
          ].includes(selectedCategoryName) &&
            category?.files.map((file: string) => {
              const isActive = (activeBlocks || []).find(
                (b) => b.name === file && b.category === selectedCategoryName,
              );
              if (isActive) return null;
              const blockPath = category.path + "/" + file;

              return (
                <li
                  key={file}
                  className="list-item add-block-item"
                  onClick={() =>
                    onAddBlock(selectedCategoryName, file, blockPath)
                  }
                >
                  <span>{file.includes('/') ? `[${file.split('/')[0]}] ${file.split('/').pop()}` : file}</span>
                  <div className="actions">
                    <IconButton
                      icon="edit"
                      title="Edit Block"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditBlock(blockPath);
                      }}
                    />
                    {!["Claude Skills", "Claude Commands", "Cursor"].includes(
                      selectedCategoryName!,
                    ) && (
                      <IconButton
                        icon="folder"
                        title="Move to Folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMoveBlock(blockPath);
                        }}
                      />
                    )}
                    {!["Claude Skills", "Claude Commands", "Cursor"].includes(
                      selectedCategoryName!,
                    ) && (
                      <IconButton
                        icon="trash"
                        title="Delete Block"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteBlock(blockPath, file);
                        }}
                      />
                    )}
                    <IconButton icon="add" title="Add" onClick={() => {}} />
                  </div>
                </li>
              );
            })}

          {![
            "Special",
            "Tools",
          ].includes(selectedCategoryName) && (
            <li
              className="list-item create-block-btn"
              style={{
                opacity: 0.6,
                borderTop: "1px solid var(--vscode-widget-border)",
                marginTop: "5px",
              }}
              onClick={() => onCreateBlock(selectedCategoryName)}
            >
              <span>
                <span className="codicon codicon-add"></span> New Block...
              </span>
            </li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <div id="categoryView">
      <ul id="categoryList" className="category-list">
        {/* User Library */}
        {library
          .filter((c) => c.type === "user")
          .map((cat) => (
            <li
              key={cat.name}
              className="list-item category-item"
              style={{
                borderLeft: `3px solid ${cat.style?.borderColor}`,
                background: `linear-gradient(90deg, ${cat.style?.color} 0%, transparent 100%)`,
                marginBottom: "2px",
              }}
              onClick={() => onSelectCategory(cat.name)}
            >
              <span>{cat.name}</span>
              <div
                className="category-actions"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span style={{ opacity: 0.5, fontSize: "0.8em" }}>
                  {cat.files.length}
                </span>
                {cat.isRenameable && (
                  <IconButton
                    icon="edit"
                    title="Rename Category"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenameCategory(cat.name);
                    }}
                  />
                )}
              </div>
            </li>
          ))}

        <li
          className="list-item create-category-btn"
          style={{
            opacity: 0.6,
            marginTop: "5px",
            marginBottom: "20px",
            borderTop: "1px solid var(--vscode-widget-border)",
          }}
          onClick={onCreateCategory}
        >
          <span>
            <span className="codicon codicon-add"></span> New Category...
          </span>
        </li>

        {/* System & Tools */}
        <li
          style={{
            marginTop: "20px",
            borderTop: "1px solid var(--vscode-widget-border)",
            opacity: 0.3,
          }}
        ></li>
        {library
          .filter((c) => c.type === "system" || c.type === "tool")
          .map((cat) => (
            <li
              key={cat.name}
              className="list-item category-item"
              style={{
                borderLeft: `3px solid ${cat.style?.borderColor || "var(--vscode-widget-border)"}`,
                background: `linear-gradient(90deg, ${cat.style?.color || "transparent"}11 0%, transparent 100%)`,
                marginBottom: "2px",
              }}
              onClick={() => onSelectCategory(cat.name)}
            >
              <span>
                {cat.name === "AI-Contracts"
                  ? "AI Contracts"
                  : cat.name.replace("-", " ")}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
};

export default PromptBlocksPanel;
