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

function browserPreviewSummary() {
  return "Browser preview cannot inspect local folders. Run the Tauri desktop app.";
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

export async function bridgeBootstrapConfig() {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("bootstrap_config");
  }

  return {
    roots: [],
    source: {
      mode: "custom",
      rootId: "",
      alias: "",
      path: "",
      health: "unknown",
      readable: false,
    },
    skills: [],
  };
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

  return {
    path: normalizedPath,
    exists: false,
    isDir: false,
    readable: false,
    isSkillsRoot: false,
    health: "unknown",
    canCopy: false,
    canDelete: false,
    summary: browserPreviewSummary(),
  };
}

export async function bridgeScanSource(path) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("scan_source", { path });
  }

  const inspection = await bridgeInspectPath(path);
  return {
    path,
    health: inspection.health,
    summary: inspection.summary,
    skills: [],
  };
}

export async function bridgeCopySkill(payload) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("copy_skill", { payload });
  }

  return {
    success: false,
    message: browserPreviewSummary(),
    path: payload.targetExistingPath || payload.targetRootPath,
  };
}

export async function bridgeRecycleSkill(payload) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("recycle_skill", { payload });
  }

  return {
    success: false,
    message: browserPreviewSummary(),
    path: payload.targetPath,
  };
}

export async function bridgeRescanRoots(roots, skills) {
  const invoke = getTauriInvoke();
  if (invoke) {
    return invoke("scan_roots", { roots, previous_skills: skills });
  }

  const nextRoots = roots.map((root) => ({
    ...root,
    health: "unknown",
    canCopy: false,
    canDelete: false,
  }));

  return {
    roots: nextRoots,
    skills,
    summary: browserPreviewSummary(),
  };
}
