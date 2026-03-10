import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  STORAGE_KEY,
  initialRoots,
  initialSkills,
  initialSource,
  presets,
} from "./config.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultEntry() {
  return {
    status: "miss",
    size: "0kb",
    modified: "n/a",
    hash: "missing",
    path: "",
    isLinked: false,
    resolvedPath: "",
  };
}

function emptySourceInventory() {
  return {
    path: "",
    health: "unknown",
    summary: "",
    skills: [],
  };
}

function mergePersistedRoots(persistedRoots) {
  if (!Array.isArray(persistedRoots) || !persistedRoots.length) {
    return clone(initialRoots);
  }

  const persistedById = new Map(persistedRoots.map((root) => [root.id, root]));
  const mergedDefaults = initialRoots.map((root) => ({
    ...clone(root),
    ...(persistedById.get(root.id) ?? {}),
  }));
  const customRoots = persistedRoots
    .filter((root) => !initialRoots.some((item) => item.id === root.id))
    .map((root) => ({
      canCopy: false,
      canDelete: false,
      ...root,
    }));

  return [...mergedDefaults, ...customRoots];
}

export const state = {
  locale: "zh",
  zoom: 1,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  issuesOnly: true,
  search: "",
  sortAsc: true,
  selectedSkillId: "frontend-design",
  selectedRootId: "win-opencode",
  activePreset: "windows",
  roots: clone(initialRoots),
  skills: clone(initialSkills),
  source: clone(initialSource),
  sourceInventory: emptySourceInventory(),
  presets,
};

export function getVisibleRoots() {
  return state.roots.filter((root) => root.visible);
}

export function ensureSkillEntries() {
  state.skills.forEach((skill) => {
    state.roots.forEach((root) => {
      if (!skill.entries[root.id]) {
        skill.entries[root.id] = defaultEntry();
        return;
      }

      skill.entries[root.id] = {
        ...defaultEntry(),
        ...skill.entries[root.id],
      };
    });
  });
}

export function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      ensureSkillEntries();
      return;
    }

    const persisted = JSON.parse(raw);
    if (Array.isArray(persisted.roots)) state.roots = mergePersistedRoots(persisted.roots);
    if (typeof persisted.issuesOnly === "boolean") state.issuesOnly = persisted.issuesOnly;
    if (typeof persisted.search === "string") state.search = persisted.search;
    if (typeof persisted.sortAsc === "boolean") state.sortAsc = persisted.sortAsc;
    if (typeof persisted.locale === "string") state.locale = persisted.locale;
    if (typeof persisted.zoom === "number") state.zoom = persisted.zoom;
    if (typeof persisted.sidebarWidth === "number") {
      state.sidebarWidth = clampSidebarWidth(persisted.sidebarWidth);
    }
    if (typeof persisted.selectedSkillId === "string") state.selectedSkillId = persisted.selectedSkillId;
    if (typeof persisted.selectedRootId === "string") state.selectedRootId = persisted.selectedRootId;
    if (typeof persisted.activePreset === "string") state.activePreset = persisted.activePreset;
    if (persisted.source && typeof persisted.source === "object") {
      state.source = { ...clone(initialSource), ...persisted.source };
    }
  } catch (error) {
    console.warn("Failed to load persisted state", error);
  }

  ensureSkillEntries();
  syncSourceWithRoots();
}

export function saveState() {
  const snapshot = {
    locale: state.locale,
    zoom: state.zoom,
    sidebarWidth: state.sidebarWidth,
    roots: state.roots,
    issuesOnly: state.issuesOnly,
    search: state.search,
    sortAsc: state.sortAsc,
    selectedSkillId: state.selectedSkillId,
    selectedRootId: state.selectedRootId,
    activePreset: state.activePreset,
    source: state.source,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

export function countIssues() {
  return state.skills.reduce((count, skill) => {
    return count + Object.values(skill.entries).filter((entry) => entry.status !== "ok").length;
  }, 0);
}

export function getFilteredSkills() {
  const query = state.search.trim().toLowerCase();
  const visibleRoots = getVisibleRoots().map((root) => root.id);
  let skills = state.skills.filter((skill) => {
    const matchesQuery = !query || skill.name.toLowerCase().includes(query);
    if (!matchesQuery) return false;
    if (!state.issuesOnly) return true;
    return visibleRoots.some((rootId) => {
      const entry = skill.entries[rootId];
      return entry && entry.status !== "ok";
    });
  });

  skills = [...skills].sort((left, right) =>
    state.sortAsc ? left.name.localeCompare(right.name) : right.name.localeCompare(left.name),
  );

  return skills;
}

export function getSourceSkill(skillName) {
  return state.sourceInventory.skills.find((skill) => skill.name === skillName) ?? null;
}

export function sourceHasSkill(skillName) {
  return Boolean(getSourceSkill(skillName));
}

export function toggleRootVisibility(rootId) {
  const root = state.roots.find((item) => item.id === rootId);
  if (!root) return;
  root.visible = !root.visible;
  if (!getVisibleRoots().length) root.visible = true;
  state.activePreset = "";
}

export function applyPreset(presetId) {
  const visibleSet = new Set(state.presets[presetId] ?? []);
  state.roots.forEach((root) => {
    root.visible = visibleSet.has(root.id);
  });
  state.activePreset = presetId;
}

export function selectSkill(skillId) {
  state.selectedSkillId = skillId;
}

export function selectCell(skillId, rootId) {
  state.selectedSkillId = skillId;
  state.selectedRootId = rootId;
}

export function setSearch(search) {
  state.search = search;
}

export function toggleIssuesOnly() {
  state.issuesOnly = !state.issuesOnly;
}

export function toggleSort() {
  state.sortAsc = !state.sortAsc;
}

export function setSidebarWidth(width) {
  state.sidebarWidth = clampSidebarWidth(width);
}

export function upsertCustomRoot(path, alias) {
  const rootId = `custom-${alias.toLowerCase().replace(/\s+/g, "-")}`;
  const existingRoot = state.roots.find((root) => root.id === rootId || root.label === alias);

  if (existingRoot) {
    existingRoot.path = path;
    existingRoot.label = alias;
    existingRoot.visible = true;
    return existingRoot;
  }

  const newRoot = {
    id: rootId,
    label: alias,
    path,
    visible: true,
    kind: "custom",
    health: "unknown",
    canCopy: false,
    canDelete: false,
  };
  state.roots.push(newRoot);
  ensureSkillEntries();
  return newRoot;
}

export function setSourceFromRoot(rootId) {
  const root = state.roots.find((item) => item.id === rootId);
  if (!root) return null;
  state.source = {
    mode: "root",
    rootId: root.id,
    alias: root.label,
    path: root.path,
    health: root.health,
    readable: root.health === "healthy",
  };
  return state.source;
}

export function setCustomSource(path, alias, inspection = {}) {
  if (!path || !alias) return null;
  state.source = {
    mode: "custom",
    rootId: "",
    alias,
    path,
    health: inspection.health ?? "unknown",
    readable: inspection.readable ?? false,
  };
  return state.source;
}

export function setSourceInventory(inventory) {
  state.sourceInventory = {
    ...emptySourceInventory(),
    ...(inventory ?? {}),
    skills: Array.isArray(inventory?.skills) ? inventory.skills : [],
  };
}

export function clearSourceInventory() {
  state.sourceInventory = emptySourceInventory();
}

export function renameCustomRoot(rootId, nextAlias) {
  const root = state.roots.find((item) => item.id === rootId && item.kind === "custom");
  if (!root || !nextAlias) return null;
  root.label = nextAlias;
  return root;
}

export function updateRoot(rootId, nextPath, nextAlias) {
  const root = state.roots.find((item) => item.id === rootId);
  if (!root) return null;
  if (nextPath) root.path = nextPath;
  if (nextAlias) root.label = nextAlias;
  return root;
}

export function removeCustomRoot(rootId) {
  state.roots = state.roots.filter((root) => root.id !== rootId);
  state.skills.forEach((skill) => {
    delete skill.entries[rootId];
  });
  if (state.selectedRootId === rootId) {
    state.selectedRootId = state.roots[0]?.id ?? "";
  }
  state.activePreset = "";
}

export function applyScanResults(result) {
  if (Array.isArray(result.roots)) {
    state.roots = result.roots;
  }
  if (Array.isArray(result.skills)) {
    state.skills = result.skills;
  }
  ensureSkillEntries();
  syncSourceWithRoots();
  if (!state.skills.some((skill) => skill.id === state.selectedSkillId)) {
    state.selectedSkillId = state.skills[0]?.id ?? "";
  }
  if (!state.roots.some((root) => root.id === state.selectedRootId)) {
    state.selectedRootId = state.roots[0]?.id ?? "";
  }
}

export function getSelectedSkill() {
  return state.skills.find((skill) => skill.id === state.selectedSkillId) ?? state.skills[0];
}

export function getSelectedRoot() {
  return state.roots.find((root) => root.id === state.selectedRootId) ?? getVisibleRoots()[0];
}

export function getSelectedEntry() {
  const skill = getSelectedSkill();
  const root = getSelectedRoot();
  return skill?.entries?.[root?.id] ?? null;
}

export function getActiveSource() {
  if (state.source.mode === "root") {
    const root = state.roots.find((item) => item.id === state.source.rootId);
    if (root) {
      return {
        mode: "root",
        rootId: root.id,
        alias: root.label,
        path: root.path,
        health: root.health,
        readable: root.health === "healthy",
      };
    }
  }

  return {
    mode: "custom",
    rootId: "",
    alias: state.source.alias,
    path: state.source.path,
    health: state.source.health ?? "unknown",
    readable: Boolean(state.source.readable),
  };
}

export function updateCustomSourceHealth(inspection) {
  if (state.source.mode !== "custom" || !inspection) return;
  state.source.health = inspection.health ?? state.source.health;
  state.source.readable = inspection.readable ?? state.source.readable;
  if (inspection.path) {
    state.source.path = inspection.path;
  }
}

function syncSourceWithRoots() {
  if (state.source.mode === "root") {
    const root = state.roots.find((item) => item.id === state.source.rootId);
    if (root) {
      state.source.alias = root.label;
      state.source.path = root.path;
      state.source.health = root.health;
      state.source.readable = root.health === "healthy";
      return;
    }
  }

  if (!state.source.path) {
    const fallbackRoot = state.roots.find((item) => item.health === "healthy") ?? state.roots[0];
    if (fallbackRoot) {
      setSourceFromRoot(fallbackRoot.id);
    }
  }
}

function clampSidebarWidth(width) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Number(width) || DEFAULT_SIDEBAR_WIDTH));
}
