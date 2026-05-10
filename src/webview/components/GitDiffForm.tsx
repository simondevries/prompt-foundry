import React, { useState } from "react";

interface GitDiffFormProps {
  branches: string[];
  onConfirm: (variables: {
    diff_type: "working_tree" | "branch" | "commit";
    staged: boolean;
    unstaged: boolean;
    branch: string;
    manual_ref: string;
    summary_only: boolean;
  }) => void;
  onBack: () => void;
}

const GitDiffForm: React.FC<GitDiffFormProps> = ({
  branches,
  onConfirm,
  onBack,
}) => {
  const [diffType, setDiffType] = useState<"working_tree" | "branch" | "commit">(
    "working_tree",
  );
  const [staged, setStaged] = useState(true);
  const [unstaged, setUnstaged] = useState(true);
  const [branch, setBranch] = useState("HEAD");
  const [manualRef, setManualRef] = useState("");
  const [summaryOnly, setSummaryOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    if (diffType === "commit") {
      const trimmed = manualRef.trim();
      const hexRegex = /^[0-9a-fA-F]{4,64}$/;
      if (!hexRegex.test(trimmed)) {
        setError("Invalid commit hash. Please use 4-64 hex characters.");
        return;
      }
    }
    setError(null);
    onConfirm({
      diff_type: diffType,
      staged,
      unstaged,
      branch,
      manual_ref: manualRef,
      summary_only: summaryOnly,
    });
  };

  return (
    <div id="formView">
      <div className="back-to-blocks-btn" onClick={onBack}>
        <span>
          <span className="codicon codicon-chevron-left"></span> Back to Blocks
        </span>
      </div>

      <h3>Git Diff</h3>

      {error && (
        <div
          style={{
            color: "#f48771",
            marginBottom: "10px",
            fontSize: "0.9em",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span className="codicon codicon-error"></span>
          {error}
        </div>
      )}

      <div className="form-group">
        <label>Diff Target</label>
        <select
          value={diffType}
          onChange={(e) => {
            setDiffType(e.target.value as "working_tree" | "branch" | "commit");
            setError(null);
          }}
        >
          <option value="working_tree">Working Tree (Current Files)</option>
          <option value="branch">Branch / Ref</option>
          <option value="commit">Specific Commit</option>
        </select>
      </div>

      {diffType === "working_tree" && (
        <div className="form-group">
          <label>Include Changes</label>
          <div style={{ display: "flex", gap: "15px", marginTop: "5px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={staged}
                onChange={(e) => setStaged(e.target.checked)}
              />
              Staged
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={unstaged}
                onChange={(e) => setUnstaged(e.target.checked)}
              />
              Unstaged
            </label>
          </div>
        </div>
      )}

      {diffType === "branch" && (
        <div className="form-group">
          <label>Select Branch</label>
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="HEAD">HEAD</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}

      {diffType === "commit" && (
        <div className="form-group">
          <label>Commit Hash</label>
          <input
            type="text"
            placeholder="e.g. d34f1a2"
            value={manualRef}
            onChange={(e) => {
              setManualRef(e.target.value);
              if (error) setError(null);
            }}
          />
        </div>
      )}

      <div className="form-group">
        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={summaryOnly}
            onChange={(e) => setSummaryOnly(e.target.checked)}
          />
          Summary Only (File list only, no diff content)
        </label>
      </div>

      <button
        className="main-btn"
        onClick={handleConfirm}
      >
        Add to Prompt
      </button>
    </div>
  );
};

export default GitDiffForm;
