import React, { useState } from "react";
import { Category } from "../types";

interface LiquidVariablesFormProps {
  category: string;
  name: string;
  schema?: Record<string, { type: string; options?: string[] }>;
  library?: Category[];
  onConfirm: (variables: Record<string, string>) => void;
  onBack: () => void;
}

const LiquidVariablesForm: React.FC<LiquidVariablesFormProps> = ({
  category,
  name,
  schema,
  library,
  onConfirm,
  onBack,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});

  const handleInputChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    onConfirm(values);
  };

  const renderField = (
    key: string,
    config: { type: string; options?: string[] },
  ) => {
    if (config.type === "select") {
      if (!config.options || !Array.isArray(config.options)) {
        return (
          <div
            className="error-text"
            style={{
              color: "var(--vscode-errorForeground)",
              fontSize: "0.8em",
            }}
          >
            Invalid schema: "options" must be an array for type "select".
          </div>
        );
      }
      return (
        <select
          key={key}
          value={values[key] || ""}
          onChange={(e) => handleInputChange(key, e.target.value)}
        >
          <option value="">--</option>
          {config.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    if (config.type === "promptBlock" && library) {
      const allBlocks: { category: string; name: string }[] = [];
      library.forEach((cat) => {
        if (cat.files) {
          cat.files.forEach((file) => {
            const fileName = typeof file === "string" ? file : file.name;
            if (fileName) {
              allBlocks.push({ category: cat.name, name: fileName });
            }
          });
        }
      });

      return (
        <select
          key={key}
          value={values[key] || ""}
          onChange={(e) => handleInputChange(key, e.target.value)}
        >
          <option value="">-- Select a Prompt Block --</option>
          {allBlocks.map((block) => {
            const value = `Category: ${block.category}, Name: ${block.name}`;
            return (
              <option key={value} value={value}>
                {block.category} / {block.name}
              </option>
            );
          })}
        </select>
      );
    }

    if (config.type === "checkbox") {
      return (
        <input
          key={key}
          type="checkbox"
          checked={values[key] === "true"}
          onChange={(e) =>
            handleInputChange(key, e.target.checked ? "true" : "false")
          }
          style={{ width: "auto", alignSelf: "flex-start", margin: "10px 0" }}
        />
      );
    }

    return (
      <input
        key={key}
        type="text"
        placeholder={`Enter value for ${key}`}
        value={values[key] || ""}
        onChange={(e) => handleInputChange(key, e.target.value)}
      />
    );
  };

  return (
    <div id="formView">
      <div className="back-to-blocks-btn" onClick={onBack}>
        <span>
          <span className="codicon codicon-chevron-left"></span> Back to Blocks
        </span>
      </div>

      <h3>
        {category} / {name}
      </h3>

      {schema &&
        Object.entries(schema).map(([key, config]) => (
          <div key={key} className="form-group">
            <label>{key}</label>
            {renderField(key, config)}
          </div>
        ))}

      <button className="main-btn" onClick={handleConfirm}>
        Confirm
      </button>
    </div>
  );
};

export default LiquidVariablesForm;
