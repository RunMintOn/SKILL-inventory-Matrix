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

function entry(status, size, modified, hash, path, isLinked = false, resolvedPath = "") {
  return { status, size, modified, hash, path, isLinked, resolvedPath };
}

export const initialRoots = [
  {
    id: "win-agents",
    label: "Agent",
    path: "C:\\Users\\l3e\\.agents\\skills",
    visible: true,
    kind: "agents",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "win-opencode",
    label: "OpenCode",
    path: "C:\\Users\\l3e\\.config\\opencode\\skills",
    visible: true,
    kind: "opencode",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "win-codex",
    label: "Codex",
    path: "C:\\Users\\l3e\\.codex\\skills",
    visible: true,
    kind: "codex",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "win-claude",
    label: "Claude",
    path: "C:\\Users\\l3e\\.claude\\skills",
    visible: true,
    kind: "claude",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "win-gemini",
    label: "Gemini",
    path: "C:\\Users\\l3e\\.gemini\\skills",
    visible: true,
    kind: "gemini",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "win-antigravity",
    label: "Antigravity",
    path: "C:\\Users\\l3e\\.antigravity\\skills",
    visible: true,
    kind: "antigravity",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "win-qwen",
    label: "Qwen",
    path: "C:\\Users\\l3e\\.qwen\\skills",
    visible: true,
    kind: "qwen",
    health: "healthy",
    canCopy: true,
    canDelete: true,
  },
  {
    id: "wsl-codex",
    label: "WSL Codex",
    path: "\\\\wsl.localhost\\Ubuntu\\home\\lee\\.codex\\skills",
    visible: true,
    kind: "codex",
    health: "degraded",
    canCopy: false,
    canDelete: false,
  },
];

export const initialSource = {
  mode: "custom",
  rootId: "",
  alias: "Core Source",
  path: "D:\\7_个人文件\\all_agent_skills\\core",
  health: "healthy",
  readable: true,
};

export const initialSkills = [
  {
    id: "find-skills",
    name: "find-skills",
    preferredRootId: "win-opencode",
    entries: {
      "win-agents": entry("ok", "11kb", "4h ago", "match", "C:\\Users\\l3e\\.agents\\skills\\find-skills"),
      "win-opencode": entry("ok", "11kb", "4h ago", "match", "C:\\Users\\l3e\\.config\\opencode\\skills\\find-skills"),
      "win-codex": entry("warn", "11kb", "7h ago", "match", "C:\\Users\\l3e\\.codex\\skills\\find-skills"),
      "win-claude": entry("miss", "0kb", "n/a", "missing", ""),
      "win-gemini": entry("miss", "0kb", "n/a", "missing", ""),
      "win-antigravity": entry("miss", "0kb", "n/a", "missing", ""),
      "win-qwen": entry("miss", "0kb", "n/a", "missing", ""),
      "wsl-codex": entry("ok", "11kb", "7h ago", "match", "\\\\wsl.localhost\\Ubuntu\\home\\lee\\.codex\\skills\\find-skills"),
    },
  },
  {
    id: "frontend-design",
    name: "frontend-design",
    preferredRootId: "win-opencode",
    entries: {
      "win-agents": entry("warn", "12kb", "2h ago", "partial match", "C:\\Users\\l3e\\.agents\\skills\\frontend-design"),
      "win-opencode": entry("ok", "15kb", "5d ago", "preferred source", "C:\\Users\\l3e\\.config\\opencode\\skills\\frontend-design"),
      "win-codex": entry("miss", "0kb", "n/a", "missing", ""),
      "win-claude": entry("warn", "14kb", "3d ago", "partial match", "C:\\Users\\l3e\\.claude\\skills\\frontend-design"),
      "win-gemini": entry("miss", "0kb", "n/a", "missing", ""),
      "win-antigravity": entry("miss", "0kb", "n/a", "missing", ""),
      "win-qwen": entry("miss", "0kb", "n/a", "missing", ""),
      "wsl-codex": entry("block", "n/a", "n/a", "unreadable", "\\\\wsl.localhost\\Ubuntu\\home\\lee\\.codex\\skills\\frontend-design"),
    },
  },
  {
    id: "interaction-design",
    name: "interaction-design",
    preferredRootId: "win-claude",
    entries: {
      "win-agents": entry("miss", "0kb", "n/a", "missing", ""),
      "win-opencode": entry("ok", "9kb", "1d ago", "match", "C:\\Users\\l3e\\.config\\opencode\\skills\\interaction-design"),
      "win-codex": entry("miss", "0kb", "n/a", "missing", ""),
      "win-claude": entry("ok", "9kb", "1d ago", "match", "C:\\Users\\l3e\\.claude\\skills\\interaction-design"),
      "win-gemini": entry("miss", "0kb", "n/a", "missing", ""),
      "win-antigravity": entry("miss", "0kb", "n/a", "missing", ""),
      "win-qwen": entry("miss", "0kb", "n/a", "missing", ""),
      "wsl-codex": entry("miss", "0kb", "n/a", "missing", ""),
    },
  },
];

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
