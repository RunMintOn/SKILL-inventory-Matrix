import {
  bridgeBootstrapConfig,
  bridgeCopySkill,
  bridgeCopyText,
  bridgeInspectPath,
  bridgeOpenPath,
  bridgePickFolder,
  bridgeRecycleSkill,
  bridgeRescanRoots,
  bridgeScanSource,
  getRuntimeMode,
} from "./bridge.js";
import { t } from "./i18n.js";

export function getRuntimeLabel() {
  return getRuntimeMode();
}

export async function getBootstrapConfig() {
  return bridgeBootstrapConfig();
}

function getSelectionPath(skill, root) {
  return skill?.entries?.[root?.id]?.path || root?.path || "";
}

export async function inspectSourcePath(path) {
  return bridgeInspectPath(path);
}

export async function scanSourceInventory(path) {
  return bridgeScanSource(path);
}

export async function pickFolder() {
  return bridgePickFolder();
}

export async function copySelectedPath(skill, root) {
  const targetPath = getSelectionPath(skill, root);
  if (!targetPath) {
    return t("path.none");
  }

  const copied = await bridgeCopyText(targetPath);
  return copied ? t("toast.path.copied") : targetPath;
}

export async function openSelectedPath(skill, root) {
  const targetPath = getSelectionPath(skill, root);
  if (!targetPath) {
    return t("path.none");
  }

  const opened = await bridgeOpenPath(targetPath);
  if (opened) {
    return t("toast.path.opened", { label: root.label });
  }

  const copied = await bridgeCopyText(targetPath);
  return copied ? t("toast.path.copied") : targetPath;
}

export function compareSkillRow(skill) {
  const compared = Object.values(skill.entries).filter((entry) => entry.status === "ok" || entry.status === "warn").length;
  return t("toast.row.compared", { skill: skill.name, count: compared });
}

export async function openSourcePath(source) {
  if (!source?.path) {
    return t("source.path.none");
  }

  const opened = await bridgeOpenPath(source.path);
  if (opened) {
    return t("toast.source.opened", { label: source.alias });
  }

  const copied = await bridgeCopyText(source.path);
  return copied ? t("toast.path.copied") : source.path;
}

export async function copyFromSource(source, skill, root, strategy) {
  if (!source?.path) {
    return { success: false, message: t("source.path.none") };
  }

  const entry = skill?.entries?.[root?.id];
  return bridgeCopySkill({
    skillName: skill.name,
    sourceRootPath: source.path,
    targetRootPath: root.path,
    targetExistingPath: entry?.path || "",
    strategy,
  });
}

export async function recycleSelectedSkill(skill, root) {
  const targetPath = getSelectionPath(skill, root);
  if (!targetPath) {
    return { success: false, message: t("path.none") };
  }

  return bridgeRecycleSkill({
    targetPath,
    rootPath: root.path,
  });
}

export async function rescanRoots(roots, skills) {
  return bridgeRescanRoots(roots, skills);
}
