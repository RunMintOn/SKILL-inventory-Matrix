import { statusMeta } from "./config.js";
import {
  state,
  countIssues,
  getActiveSource,
  getFilteredSkills,
  getSelectedRoot,
  getSelectedSkill,
  getSourceSkill,
  getVisibleRoots,
  sourceHasSkill,
} from "./store.js";
import { t } from "./i18n.js";

export function createUI(actions) {
  function isReadable(entry) {
    return entry?.status === "ok" || entry?.status === "warn";
  }

  function getComparePair(skill, selectedRoot, source) {
    if (source.mode === "root" && source.rootId && skill.entries[source.rootId] && selectedRoot.id !== source.rootId) {
      return [
        [selectedRoot.id, skill.entries[selectedRoot.id]],
        [source.rootId, skill.entries[source.rootId]],
      ];
    }

    const readablePairs = Object.entries(skill.entries).filter(([, entry]) => isReadable(entry));
    return readablePairs.length >= 2 ? readablePairs.slice(0, 2) : [];
  }

  const elements = {
    rootChips: document.querySelector("#root-chips"),
    presetChips: document.querySelector("#preset-chips"),
    rootOverviewList: document.querySelector("#root-overview-list"),
    selectedSidebarRootName: document.querySelector("#selected-sidebar-root-name"),
    selectedSidebarRootPath: document.querySelector("#selected-sidebar-root-path"),
    selectedSidebarRootHealth: document.querySelector("#selected-sidebar-root-health"),
    selectedSidebarRootMeta: document.querySelector("#selected-sidebar-root-meta"),
    selectedSidebarRootActions: document.querySelector("#selected-sidebar-root-actions"),
    matrixHead: document.querySelector("#matrix-head"),
    matrixBody: document.querySelector("#matrix-body"),
    trackedSkillsValue: document.querySelector("#tracked-skills-value"),
    rootColumnsValue: document.querySelector("#root-columns-value"),
    issuesValue: document.querySelector("#issues-value"),
    runtimeModeValue: document.querySelector("#runtime-mode-value"),
    metricTrackedSkills: document.querySelector("#metric-tracked-skills"),
    metricRootCoverage: document.querySelector("#metric-root-coverage"),
    metricRootCaption: document.querySelector("#metric-root-caption"),
    activeSourceName: document.querySelector("#active-source-name"),
    activeSourceHealth: document.querySelector("#active-source-health"),
    activeSourceMode: document.querySelector("#active-source-mode"),
    activeSourcePath: document.querySelector("#active-source-path"),
    activeSourceSummary: document.querySelector("#active-source-summary"),
    openSourceAction: document.querySelector("#open-source-action"),
    customSourceForm: document.querySelector("#custom-source-form"),
    customSourcePath: document.querySelector("#custom-source-path"),
    customSourceAlias: document.querySelector("#custom-source-alias"),
    selectedSkillName: document.querySelector("#selected-skill-name"),
    selectedRootName: document.querySelector("#selected-root-name"),
    selectedStatusBadge: document.querySelector("#selected-status-badge"),
    selectedStatusNote: document.querySelector("#selected-status-note"),
    selectedReason: document.querySelector("#selected-reason"),
    selectedCurrentPath: document.querySelector("#selected-current-path"),
    selectedCurrentLinkRow: document.querySelector("#selected-current-link-row"),
    selectedCurrentLink: document.querySelector("#selected-current-link"),
    selectedPreferredPath: document.querySelector("#selected-preferred-path"),
    selectedPreferredLinkRow: document.querySelector("#selected-preferred-link-row"),
    selectedPreferredLink: document.querySelector("#selected-preferred-link"),
    selectedPaths: document.querySelector("#selected-paths"),
    diffPair: document.querySelector("#diff-pair"),
    diffSize: document.querySelector("#diff-size"),
    diffModified: document.querySelector("#diff-modified"),
    diffHash: document.querySelector("#diff-hash"),
    actionHelp: document.querySelector("#action-help"),
    skillSearch: document.querySelector("#skill-search"),
    issuesToggle: document.querySelector("#issues-toggle"),
    sortToggle: document.querySelector("#sort-toggle"),
    importForm: document.querySelector("#import-form"),
    customRootPath: document.querySelector("#custom-root-path"),
    customRootAlias: document.querySelector("#custom-root-alias"),
    pickRootFolder: document.querySelector("#pick-root-folder"),
    saveAliasPreview: document.querySelector("#save-alias-preview"),
    customRootsList: document.querySelector("#custom-roots-list"),
    langToggle: document.querySelector("#lang-toggle"),
    rescanRootsAction: document.querySelector("#rescan-roots-action"),
    copyFromSourceAction: document.querySelector("#copy-from-source-action"),
    deleteTargetAction: document.querySelector("#delete-target-action"),
    openRootAction: document.querySelector("#open-root-action"),
    copyPathAction: document.querySelector("#copy-path-action"),
    toast: document.querySelector("#toast"),
  };

  let toastTimer = null;

  function formatHealthLabel(health) {
    if (health === "healthy") return t("health.healthy");
    if (health === "degraded") return t("health.degraded");
    if (health === "unknown") return t("health.unknown");
    return t("health.unknown");
  }

  function renderPathMeta(container, parts) {
    container.innerHTML = "";
    parts.forEach((part) => {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = part;
      container.appendChild(chip);
    });
  }

  function applyTranslations() {
    document.title = t("app.title");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (key) node.textContent = t(key);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (key) node.setAttribute("placeholder", t(key));
    });
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toast.hidden = true;
    }, 2200);
  }

  function renderSidebarStats() {
    const healthyRoots = state.roots.filter((root) => root.health === "healthy").length;
    const degradedRoots = state.roots.filter((root) => root.health === "degraded").length;

    elements.trackedSkillsValue.textContent = String(state.skills.length);
    elements.rootColumnsValue.textContent = String(state.roots.length);
    elements.issuesValue.textContent = String(countIssues());
    elements.metricTrackedSkills.textContent = String(state.skills.length);
    elements.metricRootCoverage.textContent = String(state.roots.length);
    elements.metricRootCaption.textContent = `${healthyRoots} ${t("health.healthy")} · ${degradedRoots} ${t("health.degraded")}`;
    elements.runtimeModeValue.textContent = t(actions.getRuntimeLabel() === "tauri" ? "runtime.tauri" : "runtime.browser");
  }

  function renderSourceCard() {
    const source = getActiveSource();
    elements.activeSourceName.textContent = source.alias || t("source.none");
    elements.activeSourceMode.textContent = source.mode === "root" ? t("source.mode.root") : t("source.mode.custom");
    elements.activeSourcePath.textContent = source.path || t("source.path.none");
    elements.activeSourceSummary.textContent = state.sourceInventory.summary || t("source.summary.empty");
    elements.activeSourceHealth.textContent = formatHealthLabel(source.health || "unknown");
    elements.activeSourceHealth.className = `status-pill status-pill--${source.health === "healthy" ? "ok" : source.health === "degraded" ? "block" : "miss"}`;
    elements.openSourceAction.disabled = !source.path;
  }

  function buildRootActionButton(label, onClick, variant = "secondary") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button button--${variant} button--small`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderRootRow(list, root) {
    const item = document.createElement("li");
    item.className = `root-row ${root.id === state.selectedRootId ? "root-row--selected" : ""}`;
    item.addEventListener("click", () => actions.onSelectRoot(root.id));

    const title = document.createElement("strong");
    title.className = "root-row__title";
    title.textContent = root.label;

    const path = document.createElement("span");
    path.className = "root-row__path";
    path.textContent = root.path;

    const status = document.createElement("span");
    status.className = `status-pill status-pill--${root.health === "healthy" ? "ok" : root.health === "degraded" ? "block" : "miss"}`;
    status.textContent = formatHealthLabel(root.health);

    item.append(title, path, status);
    list.appendChild(item);
  }

  function renderRootOverview() {
    elements.rootOverviewList.innerHTML = "";
    state.roots
      .filter((root) => root.kind !== "custom")
      .forEach((root) => {
        renderRootRow(elements.rootOverviewList, root);
      });
  }

  function renderCustomRoots() {
    const customRoots = state.roots.filter((root) => root.kind === "custom");
    elements.customRootsList.innerHTML = "";

    if (!customRoots.length) {
      const empty = document.createElement("li");
      empty.className = "root-registry-item--empty";
      empty.textContent = t("root.custom.empty");
      elements.customRootsList.appendChild(empty);
      return;
    }

    customRoots.forEach((root) => {
      renderRootRow(elements.customRootsList, root);
    });
  }

  function renderSelectedRootPanel() {
    const root = getSelectedRoot();
    if (!root) return;

    elements.selectedSidebarRootName.textContent = root.label;
    elements.selectedSidebarRootPath.textContent = root.path;
    elements.selectedSidebarRootHealth.textContent = formatHealthLabel(root.health);
    elements.selectedSidebarRootHealth.className = `status-pill status-pill--${root.health === "healthy" ? "ok" : root.health === "degraded" ? "block" : "miss"}`;

    renderPathMeta(elements.selectedSidebarRootMeta, [
      root.visible ? t("root.meta.visible") : t("root.meta.hidden"),
      root.canDelete ? t("root.meta.deleteEnabled") : t("root.meta.readCopy"),
    ]);

    elements.selectedSidebarRootActions.innerHTML = "";
    elements.selectedSidebarRootActions.append(
      buildRootActionButton(t("root.action.open"), async () => {
        showToast(await actions.onOpenPath(root.path, root.label));
      }),
      buildRootActionButton(t("root.action.useSource"), () => actions.onSetSourceFromRoot(root.id), "primary"),
      buildRootActionButton(t("root.action.edit"), () => actions.onEditRoot(root.id)),
      buildRootActionButton(root.visible ? t("root.action.hide") : t("root.action.show"), () => actions.onToggleRoot(root.id)),
    );

    if (root.kind === "custom") {
      elements.selectedSidebarRootActions.append(
        buildRootActionButton(t("root.custom.remove"), () => actions.onRemoveCustomRoot(root.id)),
      );
    }
  }

  function renderRootChips() {
    elements.rootChips.innerHTML = "";
    state.roots.forEach((root) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `root-chip ${root.visible ? "root-chip--visible" : "root-chip--hidden"}`;
      button.textContent = root.visible ? root.label : `${root.label} hidden`;
      button.addEventListener("click", () => actions.onToggleRoot(root.id));
      elements.rootChips.appendChild(button);
    });
  }

  function renderPresetChips() {
    const presetEntries = [
      ["codex", "Codex view"],
      ["claude", "Claude view"],
      ["windows", "All Windows"],
    ];

    elements.presetChips.innerHTML = "";
    presetEntries.forEach(([id, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `preset-chip ${state.activePreset === id ? "preset-chip--active" : ""}`;
      button.textContent = label;
      button.addEventListener("click", () => actions.onApplyPreset(id));
      elements.presetChips.appendChild(button);
    });
  }

  function renderTable() {
    const visibleRoots = getVisibleRoots();
    const filteredSkills = getFilteredSkills();

    elements.matrixHead.innerHTML = "";
    const headRow = document.createElement("tr");
    const skillHead = document.createElement("th");
    skillHead.textContent = t("matrix.skillName");
    headRow.appendChild(skillHead);

    visibleRoots.forEach((root) => {
      const th = document.createElement("th");
      th.textContent = root.label;
      headRow.appendChild(th);
    });
    elements.matrixHead.appendChild(headRow);

    elements.matrixBody.innerHTML = "";
    filteredSkills.forEach((skill) => {
      const tr = document.createElement("tr");
      if (skill.id === state.selectedSkillId) tr.classList.add("is-selected");

      const skillCell = document.createElement("td");
      skillCell.className = "skill-name-cell";

      const skillName = document.createElement("button");
      skillName.type = "button";
      skillName.className = "skill-name-button";
      skillName.addEventListener("click", () => actions.onSelectSkill(skill.id));

      const nameLabel = document.createElement("span");
      nameLabel.textContent = skill.name;
      skillName.appendChild(nameLabel);

      if (sourceHasSkill(skill.name)) {
        const badge = document.createElement("span");
        badge.className = "inline-badge inline-badge--source";
        badge.textContent = t("matrix.sourceMark");
        skillName.appendChild(badge);
      }

      skillCell.appendChild(skillName);
      tr.appendChild(skillCell);

      visibleRoots.forEach((root) => {
        const entry = skill.entries[root.id];
        const td = document.createElement("td");
        td.className = `matrix-status matrix-status--${entry.status}`;
        if (skill.id === state.selectedSkillId && root.id === state.selectedRootId) {
          td.classList.add("is-focused");
        }

        const label = document.createElement("span");
        label.textContent = t(statusMeta[entry.status].labelKey);
        td.appendChild(label);

        if (entry.isLinked) {
          const linked = document.createElement("span");
          linked.className = "inline-badge";
          linked.textContent = t("matrix.linkMark");
          td.appendChild(linked);
        }

        td.addEventListener("click", () => actions.onSelectCell(skill.id, root.id));
        tr.appendChild(td);
      });

      elements.matrixBody.appendChild(tr);
    });

    if (!filteredSkills.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = visibleRoots.length + 1;
      td.className = "matrix-empty";
      td.textContent = t("matrix.empty");
      tr.appendChild(td);
      elements.matrixBody.appendChild(tr);
    }
  }

  function renderInspector() {
    const skill = getSelectedSkill();
    const root = getSelectedRoot();
    const entry = skill.entries[root.id];
    const source = getActiveSource();
    const sourceSkill = getSourceSkill(skill.name);

    elements.selectedSkillName.textContent = skill.name;
    elements.selectedRootName.textContent = root.label;
    elements.selectedStatusBadge.textContent = t(statusMeta[entry.status].labelKey);
    elements.selectedStatusBadge.className = `status-pill status-pill--${entry.status}`;
    elements.selectedStatusNote.textContent =
      entry.status === "block"
        ? t("inspector.status.block")
        : `${root.label} ${t(statusMeta[entry.status].labelKey)}`;
    elements.selectedReason.textContent = t(statusMeta[entry.status].reasonKey);
    elements.selectedCurrentPath.textContent = entry.path || t("path.none");
    elements.selectedCurrentLinkRow.hidden = !entry.isLinked;
    elements.selectedCurrentLink.textContent = entry.resolvedPath || t("path.none");
    elements.selectedPreferredPath.textContent = sourceSkill?.path || source.path || t("source.path.none");
    elements.selectedPreferredLinkRow.hidden = !sourceSkill?.isLinked;
    elements.selectedPreferredLink.textContent = sourceSkill?.resolvedPath || t("path.none");

    const paths = Object.entries(skill.entries)
      .filter(([, currentEntry]) => currentEntry.path)
      .map(([rootId, currentEntry]) => {
        const currentRoot = state.roots.find((item) => item.id === rootId);
        const suffix = currentEntry.isLinked ? ` (${t("matrix.linkMark")} -> ${currentEntry.resolvedPath})` : "";
        return `${currentRoot?.label ?? rootId}: ${currentEntry.path}${suffix}`;
      });

    elements.selectedPaths.innerHTML = "";
    if (!paths.length) {
      const item = document.createElement("li");
      item.textContent = t("path.noneList");
      elements.selectedPaths.appendChild(item);
    } else {
      paths.forEach((path) => {
        const item = document.createElement("li");
        item.textContent = path;
        elements.selectedPaths.appendChild(item);
      });
    }

    const compareRoots = getComparePair(skill, root, source);
    if (compareRoots.length === 2) {
      const [left, right] = compareRoots;
      const leftRoot = state.roots.find((item) => item.id === left[0]);
      const rightRoot = state.roots.find((item) => item.id === right[0]);
      elements.diffPair.textContent = `${leftRoot?.label ?? left[0]} vs ${rightRoot?.label ?? right[0]}`;
      elements.diffSize.textContent = `${left[1].size} vs ${right[1].size}`;
      elements.diffModified.textContent = `${left[1].modified} vs ${right[1].modified}`;
      elements.diffHash.textContent = `${left[1].hash} vs ${right[1].hash}`;
    } else {
      elements.diffPair.textContent = t("diff.needTwo");
      elements.diffSize.textContent = "n/a";
      elements.diffModified.textContent = "n/a";
      elements.diffHash.textContent = "n/a";
    }

    const canCopy = Boolean(source.path) && Boolean(root.canCopy) && entry.status !== "block";
    const canDelete = Boolean(root.canDelete) && Boolean(entry.path) && (entry.status === "ok" || entry.status === "warn");

    elements.copyFromSourceAction.disabled = !canCopy;
    elements.deleteTargetAction.disabled = !canDelete;
    elements.actionHelp.textContent = entry.status === "block"
      ? t(statusMeta.block.reasonKey)
      : root.canDelete
        ? t("inspector.actionHelpDefault")
        : t("action.deleteDisabled");
  }

  function renderControls() {
    elements.skillSearch.value = state.search;
    elements.issuesToggle.className = `chip ${state.issuesOnly ? "chip--active" : ""}`;
    elements.sortToggle.textContent = state.sortAsc ? "A-Z" : "Z-A";
    elements.langToggle.textContent = state.locale === "zh" ? "EN" : "中文";
  }

  function bindEvents() {
    elements.skillSearch.addEventListener("input", (event) => actions.onSearch(event.target.value));
    elements.issuesToggle.addEventListener("click", actions.onToggleIssuesOnly);
    elements.sortToggle.addEventListener("click", actions.onToggleSort);

    elements.importForm.addEventListener("submit", (event) => {
      event.preventDefault();
      actions.onImportRoot(elements.customRootPath.value.trim(), elements.customRootAlias.value.trim());
    });
    elements.pickRootFolder.addEventListener("click", actions.onPickRootFolder);

    elements.customSourceForm.addEventListener("submit", (event) => {
      event.preventDefault();
      actions.onSetCustomSource(elements.customSourcePath.value.trim(), elements.customSourceAlias.value.trim());
    });

    elements.saveAliasPreview.addEventListener("click", () => {
      const alias = elements.customRootAlias.value.trim();
      if (!alias) return;
      elements.customRootAlias.value = alias.replace(/\s+/g, " ").trim();
    });

    elements.openSourceAction.addEventListener("click", actions.onOpenSource);
    elements.copyFromSourceAction.addEventListener("click", actions.onCopyFromSource);
    elements.deleteTargetAction.addEventListener("click", actions.onDeleteSelectedSkill);
    elements.openRootAction.addEventListener("click", actions.onOpenSelectedRoot);
    elements.copyPathAction.addEventListener("click", actions.onCopySelectedPath);
    elements.rescanRootsAction.addEventListener("click", actions.onRescanRoots);
    elements.langToggle.addEventListener("click", actions.onToggleLocale);
  }

  function clearImportInputs() {
    elements.customRootPath.value = "";
    elements.customRootAlias.value = "";
  }

  function getImportAlias() {
    return elements.customRootAlias.value.trim();
  }

  function setImportAlias(value) {
    elements.customRootAlias.value = value;
  }

  function setImportPath(value) {
    elements.customRootPath.value = value;
  }

  function clearSourceInputs() {
    elements.customSourcePath.value = "";
    elements.customSourceAlias.value = "";
  }

  function render() {
    applyTranslations();
    renderSidebarStats();
    renderSourceCard();
    renderRootOverview();
    renderCustomRoots();
    renderSelectedRootPanel();
    renderRootChips();
    renderPresetChips();
    renderControls();
    renderTable();
    renderInspector();
  }

  return {
    bindEvents,
    clearImportInputs,
    clearSourceInputs,
    getImportAlias,
    render,
    setImportAlias,
    setImportPath,
    showToast,
  };
}
