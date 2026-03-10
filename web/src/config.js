export const STORAGE_KEY = "skill-manager-matrix-state-v3";

export const DEFAULT_SIDEBAR_WIDTH = 420;
export const MIN_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 720;

export const statusMeta = {
  ok: { labelKey: "status.ok", reasonKey: "status.ok.reason" },
  warn: { labelKey: "status.warn", reasonKey: "status.warn.reason" },
  miss: { labelKey: "status.miss", reasonKey: "status.miss.reason" },
  block: { labelKey: "status.block", reasonKey: "status.block.reason" },
};

export const presets = {
  codex: ["win-codex", "wsl-codex"],
  claude: ["win-claude", "win-opencode"],
  windows: [
    "win-agents",
    "win-opencode",
    "win-codex",
    "win-claude",
    "win-gemini",
    "win-antigravity",
    "win-qwen",
  ],
};
