import { DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "./config.js";
import {
  applyPreset,
  applyScanResults,
  clearSourceInventory,
  getActiveSource,
  getSelectedRoot,
  getSelectedSkill,
  loadPersistedState,
  removeCustomRoot,
  renameCustomRoot,
  saveState,
  selectCell,
  selectSkill,
  setSidebarWidth,
  setCustomSource,
  setSearch,
  setSourceFromRoot,
  setSourceInventory,
  state,
  toggleIssuesOnly,
  toggleRootVisibility,
  toggleSort,
  updateCustomSourceHealth,
  updateRoot,
  upsertCustomRoot,
} from "./store.js";
import {
  copyFromSource,
  copySelectedPath,
  getRuntimeLabel,
  inspectSourcePath,
  openSelectedPath,
  openSourcePath,
  pickFolder,
  recycleSelectedSkill,
  rescanRoots,
  scanSourceInventory,
} from "./system-api.js";
import { createUI } from "./ui.js";
import { t, toggleLocale } from "./i18n.js";

let ui;
let sidebarResizeCleanup = null;

function persistAndRender() {
  saveState();
  ui.render();
}

function applyZoom(value) {
  const clamped = Math.min(1.2, Math.max(0.8, value));
  state.zoom = clamped;
  document.documentElement.style.zoom = String(clamped);
  saveState();
}

function applySidebarWidth(width) {
  const clamped = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Number(width) || DEFAULT_SIDEBAR_WIDTH));
  document.documentElement.style.setProperty("--sidebar-width", `${clamped}px`);
}

function initZoomControls() {
  applyZoom(state.zoom || 1);
  window.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key;
    if (key === "+" || key === "=") {
      event.preventDefault();
      applyZoom(state.zoom + 0.1);
    } else if (key === "-" || key === "_") {
      event.preventDefault();
      applyZoom(state.zoom - 0.1);
    } else if (key === "0") {
      event.preventDefault();
      applyZoom(1);
    }
  });
}

function fallbackAlias(pathValue, currentAlias) {
  if (currentAlias) return currentAlias;
  if (!pathValue) return "";
  const parts = pathValue.split(/[/\\]+/).filter(Boolean);
  const lastPart = parts[parts.length - 1] || "";
  if (lastPart.toLowerCase() === "skills") {
    return parts[parts.length - 2] || lastPart;
  }
  return lastPart;
}

function getCopyStrategyForEntry(entry) {
  if (!entry?.path || entry.status === "miss") {
    return "replace";
  }

  const choice = window.prompt(t("dialog.copy.strategy"), "REPLACE");

  if (!choice) {
    return "";
  }

  const normalized = choice.trim().toLowerCase();
  if (normalized === "replace" || normalized === "merge") {
    return normalized;
  }

  window.alert(t("dialog.copy.strategy.invalid"));
  return "";
}

async function validateSkillsPath(path, failureKey = "toast.path.invalid") {
  const inspection = await inspectSourcePath(path);
  if (inspection.readable && inspection.isSkillsRoot) {
    return inspection;
  }

  ui.showToast(inspection.summary || t(failureKey));
  return null;
}

function initSidebarResize() {
  sidebarResizeCleanup?.();

  const resizer = document.querySelector("#sidebar-resizer");
  const sidebar = document.querySelector(".sidebar");
  if (!resizer || !sidebar) return;

  applySidebarWidth(state.sidebarWidth);

  let dragState = null;

  const onPointerMove = (event) => {
    if (!dragState) return;
    const width = dragState.startWidth + (event.clientX - dragState.startX);
    setSidebarWidth(width);
    applySidebarWidth(state.sidebarWidth);
  };

  const stopDrag = () => {
    if (!dragState) return;
    dragState = null;
    document.body.classList.remove("is-resizing-sidebar");
    saveState();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  };

  const startDrag = (event) => {
    if (window.innerWidth <= 1180) return;
    dragState = {
      startX: event.clientX,
      startWidth: sidebar.getBoundingClientRect().width,
    };
    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  };

  resizer.addEventListener("pointerdown", startDrag);
  window.addEventListener("resize", () => applySidebarWidth(state.sidebarWidth));

  sidebarResizeCleanup = () => {
    resizer.removeEventListener("pointerdown", startDrag);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  };
}

function bootstrapActions() {
  const actions = {
    onApplyPreset(presetId) {
      applyPreset(presetId);
      persistAndRender();
    },
    getRuntimeLabel,
    getActiveSource,
    async onRefreshSourceInventory() {
      const source = getActiveSource();
      if (!source.path) {
        clearSourceInventory();
        persistAndRender();
        return;
      }

      try {
        const inventory = await scanSourceInventory(source.path);
        setSourceInventory(inventory);
        if (source.mode === "custom") {
          updateCustomSourceHealth(inventory);
        }
        persistAndRender();
      } catch (error) {
        clearSourceInventory();
        persistAndRender();
        ui.showToast(error.message || t("toast.source.scan.failed"));
      }
    },
    async onCopyFromSource() {
      try {
        const skill = getSelectedSkill();
        const root = getSelectedRoot();
        const entry = skill?.entries?.[root?.id];
        const source = getActiveSource();
        const strategy = getCopyStrategyForEntry(entry);
        if (!strategy) return;

        const confirmed = window.confirm(
          t("dialog.copy.confirm", { source: source.alias, skill: skill.name, root: root.label }),
        );
        if (!confirmed) return;

        const result = await copyFromSource(source, skill, root, strategy);
        if (result.success) {
          ui.showToast(t("toast.copy.success", { skill: skill.name, root: root.label }));
        } else {
          ui.showToast(result.message);
        }
        if (result.success) {
          await actions.onRescanRoots();
        }
      } catch (error) {
        ui.showToast(error.message || t("toast.copy.failed"));
      }
    },
    async onCopySelectedPath() {
      ui.showToast(await copySelectedPath(getSelectedSkill(), getSelectedRoot()));
    },
    async onDeleteSelectedSkill() {
      try {
        const skill = getSelectedSkill();
        const root = getSelectedRoot();
        const entry = skill?.entries?.[root?.id];
        if (!entry?.path) {
          ui.showToast(t("path.none"));
          return;
        }

        const confirmed = window.confirm(t("dialog.delete.confirm", { root: root.label, skill: skill.name }));
        if (!confirmed) return;

        const result = await recycleSelectedSkill(skill, root);
        if (result.success) {
          ui.showToast(t("toast.delete.success", { skill: skill.name }));
        } else {
          ui.showToast(result.message);
        }
        if (result.success) {
          await actions.onRescanRoots();
        }
      } catch (error) {
        ui.showToast(error.message || t("toast.delete.failed"));
      }
    },
    async onImportRoot(path, alias) {
      if (!path) {
        ui.showToast(t("toast.root.path.required"));
        return;
      }
      if (!alias) {
        ui.showToast(t("toast.root.alias.required"));
        return;
      }
      try {
        const inspection = await validateSkillsPath(path);
        if (!inspection) return;
        upsertCustomRoot(path, alias);
        state.activePreset = "";
        ui.clearImportInputs();
        persistAndRender();
        ui.showToast(t("toast.imported", { alias }));
        await actions.onRescanRoots();
      } catch (error) {
        ui.showToast(error.message || t("toast.root.update.failed"));
      }
    },
    async onPickRootFolder() {
      const pickedPath = await pickFolder();
      if (!pickedPath) return;
      ui.setImportPath(pickedPath);
      if (!ui.getImportAlias()) {
        ui.setImportAlias(fallbackAlias(pickedPath, ""));
      }
    },
    async onOpenPath(path, label) {
      return openSourcePath({ alias: label, path });
    },
    async onOpenSource() {
      try {
        ui.showToast(await openSourcePath(getActiveSource()));
      } catch (error) {
        ui.showToast(error.message || t("toast.source.open.failed"));
      }
    },
    async onOpenSelectedRoot() {
      try {
        ui.showToast(await openSelectedPath(getSelectedSkill(), getSelectedRoot()));
      } catch (error) {
        ui.showToast(error.message || t("toast.path.open.failed"));
      }
    },
    onRemoveCustomRoot(rootId) {
      const root = state.roots.find((item) => item.id === rootId);
      removeCustomRoot(rootId);
      persistAndRender();
      if (root) ui.showToast(t("toast.removed", { label: root.label }));
    },
    onRenameCustomRoot(rootId, alias) {
      const root = renameCustomRoot(rootId, alias);
      if (!root) return;
      persistAndRender();
      ui.showToast(t("toast.renamed", { label: root.label }));
    },
    async onEditRoot(rootId) {
      const root = state.roots.find((item) => item.id === rootId);
      if (!root) return;

      const aliasInput = window.prompt(t("dialog.root.edit.alias"), root.label);
      const nextAlias = aliasInput === null ? root.label : aliasInput.trim() || root.label;
      let nextPath = root.path;
      const shouldChangePath = window.confirm(t("dialog.root.edit.path.confirm"));
      if (shouldChangePath) {
        const pickedPath = await pickFolder();
        if (pickedPath) {
          nextPath = pickedPath;
        }
      }

      try {
        const finalPath = nextPath || root.path;
        const finalAlias = nextAlias || root.label;
        if (finalPath === root.path && finalAlias === root.label) {
          return;
        }

        if (finalPath !== root.path) {
          const inspection = await validateSkillsPath(finalPath);
          if (!inspection) return;
        }

        updateRoot(rootId, finalPath, finalAlias);
        persistAndRender();
        await actions.onRescanRoots();
        ui.showToast(t("toast.root.updated", { label: finalAlias }));
      } catch (error) {
        ui.showToast(error.message || t("toast.root.update.failed"));
      }
    },
    async onRescanRoots() {
      try {
        const result = await rescanRoots(state.roots, state.skills);
        applyScanResults(result);
        persistAndRender();

        await actions.onRefreshSourceInventory();

        const message = state.locale === "en" ? (result.summary ?? t("toast.rescan.done")) : t("toast.rescan.done");
        ui.showToast(message);
      } catch (error) {
        ui.showToast(error.message || t("toast.rescan.failed"));
      }
    },
    onSearch(value) {
      setSearch(value);
      saveState();
      ui.render();
    },
    onSelectRoot(rootId) {
      selectCell(state.selectedSkillId, rootId);
      persistAndRender();
    },
    onSelectCell(skillId, rootId) {
      selectCell(skillId, rootId);
      persistAndRender();
    },
    onSelectSkill(skillId) {
      selectSkill(skillId);
      persistAndRender();
    },
    async onSetCustomSource(path, alias) {
      let selectedPath = path;
      let selectedAlias = alias;
      if (!selectedPath) {
        selectedPath = await pickFolder();
      }
      if (!selectedPath) return;
      if (!selectedAlias) {
        selectedAlias = fallbackAlias(selectedPath, selectedAlias);
      }

      try {
        const inspection = await validateSkillsPath(selectedPath, "toast.source.invalid");
        if (!inspection) return;

        setCustomSource(selectedPath, selectedAlias, inspection);
        persistAndRender();
        await actions.onRefreshSourceInventory();
        ui.clearSourceInputs();
        ui.showToast(t("toast.source.set", { label: selectedAlias }));
      } catch (error) {
        ui.showToast(error.message || t("toast.source.open.failed"));
      }
    },
    async onSetSourceFromRoot(rootId) {
      const source = setSourceFromRoot(rootId);
      if (!source) return;
      persistAndRender();
      await actions.onRefreshSourceInventory();
      ui.showToast(t("toast.source.set", { label: source.alias }));
    },
    onToggleLocale() {
      toggleLocale();
      persistAndRender();
    },
    onToggleCustomRoot(rootId) {
      toggleRootVisibility(rootId);
      persistAndRender();
    },
    onToggleIssuesOnly() {
      toggleIssuesOnly();
      persistAndRender();
    },
    onToggleRoot(rootId) {
      toggleRootVisibility(rootId);
      persistAndRender();
    },
    onToggleSort() {
      toggleSort();
      persistAndRender();
    },
  };

  return actions;
}

export function initApp() {
  loadPersistedState();
  const actions = bootstrapActions();
  ui = createUI(actions);
  ui.bindEvents();
  ui.render();
  initZoomControls();
  initSidebarResize();

  if (getRuntimeLabel() === "tauri") {
    actions.onRescanRoots();
    return;
  }

  actions.onRefreshSourceInventory();
}
