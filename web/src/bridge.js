function getTauriInvoke() {
  return window.__TAURI__?.core?.invoke ?? window.__TAURI_INTERNALS__?.invoke ?? null;
}

export function getRuntimeMode() {
  return getTauriInvoke() ? "tauri" : "browser";
}

let folderInput = null;

function pickFolderViaInput() {
  if (!folderInput) {
    folderInput = document.createElement("input");
    folderInput.type = "file";
    folderInput.setAttribute("webkitdirectory", "");
    folderInput.setAttribute("directory", "");
    folderInput.style.position = "fixed";
    folderInput.style.left = "-9999px";
    folderInput.style.width = "1px";
    folderInput.style.height = "1px";
    document.body.appendChild(folderInput);
  }

  return new Promise((resolve) => {
    folderInput.value = "";
    folderInput.onchange = () => {
      const file = folderInput.files?.[0];
      if (!file) {
        resolve("");
        return;
      }
      const path = file.path || "";
      resolve(path);
    };
    folderInput.click();
  });
}

function normalizePath(path) {
  return String(path || "").replace(/[\\/]+$/, "");
}

function mockSkillNamesForPath(path) {
  if (path.includes("all_agent_skills")) return ["find-skills", "frontend-design", "interaction-design"];
  if (path.includes(".config")) return ["find-skills", "frontend-design", "interaction-design"];
  if (path.includes(".agents")) return ["find-skills", "frontend-design"];
  if (path.includes(".claude")) return ["frontend-design", "interaction-design"];
  if (path.includes(".gemini")) return ["find-skills"];
  if (path.includes(".antigravity")) return ["frontend-design"];
  if (path.includes(".qwen")) return ["interaction-design"];
  if (path.includes("custom-tools")) return ["find-skills"];
  if (path.includes(".codex")) return ["find-skills"];
  return [];
}

export async function bridgePickFolder() {
  const invoke = getTauriInvoke();
  if (invoke) {
    const selection = await invoke("pick_folder");
    if (Array.isArray(selection)) {
      return selection[0] || "";
    }
    return selection || "";
  }

  return pickFolderViaInput();
}

export async function bridgeCopyText(value) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("copy_text", { value });
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    console.warn("Clipboard write failed", error);
  }

  return false;
}

export async function bridgeOpenPath(path) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("open_path", { path });
  }

  return false;
}

export async function bridgeInspectPath(path) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("inspect_path", { path });
  }

  const normalizedPath = normalizePath(path);
  const isWindowsPath = /^[A-Za-z]:\\/.test(normalizedPath);
  const parts = normalizedPath.split(/[/\\]+/).filter(Boolean);
  const leaf = parts[parts.length - 1]?.toLowerCase();
  const readable = Boolean(normalizedPath) && !normalizedPath.includes("missing");
  const isSkillsRoot = readable && leaf === "skills";
  const health = readable && isSkillsRoot ? "healthy" : "degraded";

  return {
    path: normalizedPath,
    exists: Boolean(normalizedPath),
    isDir: true,
    readable,
    isSkillsRoot,
    health,
    canCopy: readable && isSkillsRoot,
    canDelete: readable && isSkillsRoot && isWindowsPath,
    summary: !normalizedPath
      ? "No path configured"
      : !readable
        ? `Mock runtime cannot read ${normalizedPath}`
        : !isSkillsRoot
          ? `${normalizedPath} must point directly to a skills folder`
          : `Mock checked ${normalizedPath}`,
  };
}

export async function bridgeScanSource(path) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("scan_source", { path });
  }

  const inspection = await bridgeInspectPath(path);
  if (!inspection.isSkillsRoot) {
    return {
      path,
      health: inspection.health,
      summary: inspection.summary,
      skills: [],
    };
  }

  const skills = mockSkillNamesForPath(path).map((name) => ({
    name,
    path: `${normalizePath(path)}\\${name}`,
    isLinked: path.includes("custom-tools") && name === "find-skills",
    resolvedPath: path.includes("custom-tools") && name === "find-skills"
      ? "C:\\SkillsHub\\find-skills"
      : "",
  }));

  return {
    path,
    health: "healthy",
    summary: `Mock scanned ${skills.length} skills from source`,
    skills,
  };
}

export async function bridgeCopySkill(payload) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("copy_skill", { payload });
  }

  return {
    success: true,
    message: `模拟复制 ${payload.skillName} -> ${payload.targetRootPath} / Mock copied ${payload.skillName} into ${payload.targetRootPath}`,
    path: payload.targetExistingPath || `${payload.targetRootPath}\\${payload.skillName}`,
  };
}

export async function bridgeRecycleSkill(payload) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("recycle_skill", { payload });
  }

  return {
    success: true,
    message: `模拟回收 ${payload.targetPath} / Mock recycled ${payload.targetPath}`,
    path: payload.targetPath,
  };
}

export async function bridgeRescanRoots(roots, skills) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("scan_roots", { roots, previous_skills: skills });
  }

  const nextRoots = roots.map((root) => {
    const normalizedPath = normalizePath(root.path);
    const isSkillsRoot = normalizedPath.toLowerCase().endsWith("\\skills") || normalizedPath.toLowerCase().endsWith("/skills");
    const readable = isSkillsRoot && !normalizedPath.includes("missing") && normalizedPath !== "";

    return {
      ...root,
      health: readable ? "healthy" : "degraded",
      canCopy: readable,
      canDelete: readable && /^[A-Za-z]:\\/.test(normalizedPath),
    };
  });

  const nextSkills = skills
    .filter((skill) => skill.name !== "skill-installer")
    .map((skill) => {
      const nextEntries = { ...skill.entries };
      nextRoots.forEach((root) => {
        const names = new Set(mockSkillNamesForPath(root.path));
        nextEntries[root.id] = names.has(skill.name)
          ? {
              status: root.health === "healthy" ? (root.path.includes(".config") ? "ok" : "warn") : "block",
              size: root.health === "healthy" ? "10kb" : "n/a",
              modified: root.health === "healthy" ? "just now" : "n/a",
              hash: root.health === "healthy" ? "rescanned" : "unreadable",
              path: root.health === "healthy" ? `${normalizePath(root.path)}\\${skill.name}` : `${normalizePath(root.path)}\\${skill.name}`,
              isLinked: root.path.includes("custom-tools") && skill.name === "find-skills",
              resolvedPath: root.path.includes("custom-tools") && skill.name === "find-skills"
                ? "C:\\SkillsHub\\find-skills"
                : "",
            }
          : {
              status: root.health === "healthy" ? "miss" : "block",
              size: root.health === "healthy" ? "0kb" : "n/a",
              modified: "n/a",
              hash: root.health === "healthy" ? "missing" : "unreadable",
              path: root.health === "healthy" ? "" : `${normalizePath(root.path)}\\${skill.name}`,
              isLinked: false,
              resolvedPath: "",
            };
      });

      return { ...skill, entries: nextEntries };
    });

  return {
    roots: nextRoots,
    skills: nextSkills,
    summary: `模拟重扫 ${nextRoots.length} 个根 / Rescanned ${nextRoots.length} roots in browser mock mode`,
  };
}
