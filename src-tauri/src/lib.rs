use arboard::Clipboard;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  collections::{BTreeMap, BTreeSet},
  env,
  fs,
  path::{Component, Path, PathBuf, Prefix},
  process::Command,
  time::{Duration, SystemTime},
};
use trash::delete;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Root {
  id: String,
  label: String,
  path: String,
  visible: bool,
  kind: String,
  health: String,
  can_copy: bool,
  can_delete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillEntry {
  status: String,
  size: String,
  modified: String,
  hash: String,
  path: String,
  #[serde(default)]
  is_linked: bool,
  #[serde(default)]
  resolved_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Skill {
  id: String,
  name: String,
  preferred_root_id: String,
  entries: BTreeMap<String, SkillEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanResult {
  roots: Vec<Root>,
  skills: Vec<Skill>,
  summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapConfig {
  roots: Vec<Root>,
  source: BootstrapSource,
  skills: Vec<Skill>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapSource {
  mode: String,
  root_id: String,
  alias: String,
  path: String,
  health: String,
  readable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationResult {
  success: bool,
  message: String,
  path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PathInspection {
  path: String,
  exists: bool,
  is_dir: bool,
  readable: bool,
  is_skills_root: bool,
  health: String,
  can_copy: bool,
  can_delete: bool,
  summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceInventorySkill {
  name: String,
  path: String,
  is_linked: bool,
  resolved_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceInventory {
  path: String,
  health: String,
  summary: String,
  skills: Vec<SourceInventorySkill>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopySkillPayload {
  skill_name: String,
  source_root_path: String,
  target_root_path: String,
  target_existing_path: String,
  strategy: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecycleSkillPayload {
  target_path: String,
  root_path: String,
}

#[derive(Debug, Clone)]
struct ScannedSkill {
  name: String,
  folder_name: String,
  relative_path: PathBuf,
  path: String,
  is_linked: bool,
  resolved_path: String,
  size_bytes: u64,
  modified: SystemTime,
  hash: String,
}

#[tauri::command]
fn copy_text(value: String) -> Result<bool, String> {
  let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
  clipboard.set_text(value).map_err(|error| error.to_string())?;
  Ok(true)
}

#[tauri::command]
fn open_path(path: String) -> Result<bool, String> {
  #[cfg(target_os = "windows")]
  {
    let status = Command::new("explorer")
      .arg(path)
      .spawn()
      .map(|_| true)
      .map_err(|error| error.to_string())?;
    Ok(status)
  }

  #[cfg(target_os = "linux")]
  {
    let status = Command::new("xdg-open")
      .arg(path)
      .spawn()
      .map(|_| true)
      .map_err(|error| error.to_string())?;
    Ok(status)
  }

  #[cfg(target_os = "macos")]
  {
    let status = Command::new("open")
      .arg(path)
      .spawn()
      .map(|_| true)
      .map_err(|error| error.to_string())?;
    Ok(status)
  }
}

#[tauri::command]
fn inspect_path(path: String) -> Result<PathInspection, String> {
  Ok(inspect_directory(&path))
}

#[tauri::command]
fn bootstrap_config() -> Result<BootstrapConfig, String> {
  Ok(BootstrapConfig {
    roots: default_roots(),
    source: BootstrapSource {
      mode: "custom".to_string(),
      root_id: String::new(),
      alias: String::new(),
      path: String::new(),
      health: "unknown".to_string(),
      readable: false,
    },
    skills: Vec::new(),
  })
}

#[tauri::command]
fn scan_source(path: String) -> Result<SourceInventory, String> {
  let source_path = Path::new(&path);
  if ensure_directory(source_path, "source path").is_err() {
    let inspection = inspect_directory(&path);
    return Ok(SourceInventory {
      path,
      health: inspection.health,
      summary: inspection.summary,
      skills: Vec::new(),
    });
  }

  let mut skills = scan_direct_skill_dirs(source_path)?
    .into_iter()
    .map(|skill| SourceInventorySkill {
      name: skill.name,
      path: skill.path,
      is_linked: skill.is_linked,
      resolved_path: skill.resolved_path,
    })
    .collect::<Vec<_>>();

  skills.sort_by(|left, right| left.name.cmp(&right.name));

  Ok(SourceInventory {
    path,
    health: "healthy".to_string(),
    summary: format!("Scanned {} skills from source", skills.len()),
    skills,
  })
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
  let selection = FileDialog::new().pick_folder();
  Ok(selection.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn copy_skill(payload: CopySkillPayload) -> Result<OperationResult, String> {
  let source_root = PathBuf::from(&payload.source_root_path);
  let target_root = PathBuf::from(&payload.target_root_path);
  ensure_skills_root(&source_root, "source root")?;
  ensure_skills_root(&target_root, "target root")?;

  let source_skill = scan_root_dir(&source_root)?
    .into_iter()
    .find(|skill| skill.name == payload.skill_name)
    .ok_or_else(|| format!("{} was not found in the active source", payload.skill_name))?;

  let target_path = if payload.target_existing_path.trim().is_empty() {
    target_root.join(&source_skill.relative_path)
  } else {
    PathBuf::from(&payload.target_existing_path)
  };

  if !target_path.starts_with(&target_root) {
    return Err("Refusing to copy outside the selected target root".to_string());
  }

  if target_path.exists() {
    match payload.strategy.trim().to_lowercase().as_str() {
      "replace" => remove_existing_path(&target_path)?,
      "merge" => {}
      _ => return Err("Unknown copy strategy".to_string()),
    }
  }

  if let Some(parent) = target_path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }

  copy_directory_recursive(Path::new(&source_skill.path), &target_path)?;

  Ok(OperationResult {
    success: true,
    message: format!("Copied {} into {}", payload.skill_name, target_path.display()),
    path: target_path.to_string_lossy().to_string(),
  })
}

#[tauri::command]
fn recycle_skill(payload: RecycleSkillPayload) -> Result<OperationResult, String> {
  let root_path = PathBuf::from(&payload.root_path);
  let target_path = PathBuf::from(&payload.target_path);

  if !is_windows_local_path(&payload.root_path) {
    return Err("Recycle Bin delete is only available for Windows local roots".to_string());
  }
  if !target_path.starts_with(&root_path) {
    return Err("Refusing to delete outside the selected root".to_string());
  }
  if !target_path.exists() {
    return Err("Selected target does not exist anymore".to_string());
  }

  delete(&target_path).map_err(|error| error.to_string())?;

  Ok(OperationResult {
    success: true,
    message: format!("Moved {} to Recycle Bin", target_path.display()),
    path: target_path.to_string_lossy().to_string(),
  })
}

#[tauri::command]
fn scan_roots(roots: Vec<Root>, previous_skills: Option<Vec<Skill>>) -> Result<ScanResult, String> {
  let mut scanned_roots = Vec::with_capacity(roots.len());
  let mut blocked_roots = BTreeSet::new();
  let mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>> = BTreeMap::new();

  for mut root in roots {
    match scan_root_dir(Path::new(&root.path)) {
      Ok(skills) => {
        root.health = "healthy".to_string();
        root.can_copy = true;
        root.can_delete = is_windows_local_path(&root.path);
        for scanned_skill in skills {
          aggregated
            .entry(scanned_skill.name.clone())
            .or_default()
            .insert(root.id.clone(), scanned_skill);
        }
      }
      Err(_) => {
        root.health = "degraded".to_string();
        root.can_copy = false;
        root.can_delete = false;
        blocked_roots.insert(root.id.clone());
      }
    }
    scanned_roots.push(root);
  }

  Ok(build_scan_result(
    scanned_roots,
    &blocked_roots,
    aggregated,
    previous_skills,
  ))
}

fn build_scan_result(
  scanned_roots: Vec<Root>,
  blocked_roots: &BTreeSet<String>,
  mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>>,
  previous_skills: Option<Vec<Skill>>,
) -> ScanResult {
  let previous_skills_by_name: BTreeMap<String, Skill> = previous_skills
    .unwrap_or_default()
    .into_iter()
    .map(|skill| (skill.name.clone(), skill))
    .collect();

  let mut skills = Vec::new();
  let skill_names: BTreeSet<String> = aggregated
    .keys()
    .cloned()
    .chain(previous_skills_by_name.keys().cloned())
    .collect();

  for skill_name in skill_names {
    let per_root = aggregated.remove(&skill_name).unwrap_or_default();
    let previous_skill = previous_skills_by_name.get(&skill_name);
    let mut preferred_root_id = previous_skill
      .map(|skill| skill.preferred_root_id.clone())
      .filter(|root_id| scanned_roots.iter().any(|root| root.id == *root_id))
      .unwrap_or_default();

    if preferred_root_id.is_empty() || !per_root.contains_key(&preferred_root_id) {
      preferred_root_id = scanned_roots
        .iter()
        .find(|root| per_root.contains_key(&root.id))
        .map(|root| root.id.clone())
        .or_else(|| previous_skill.map(|skill| skill.preferred_root_id.clone()))
        .unwrap_or_default();
    }

    let preferred_hash = per_root
      .get(&preferred_root_id)
      .map(|skill| skill.hash.clone())
      .or_else(|| per_root.values().next().map(|skill| skill.hash.clone()))
      .unwrap_or_else(|| "unknown".to_string());

    let preferred_folder_name = per_root
      .get(&preferred_root_id)
      .map(|skill| skill.folder_name.clone())
      .or_else(|| {
        previous_skill
          .and_then(|skill| skill.entries.get(&preferred_root_id))
          .and_then(|entry| folder_name_from_skill_path(&entry.path))
      })
      .or_else(|| {
        previous_skill.and_then(|skill| {
          skill
            .entries
            .values()
            .find_map(|entry| folder_name_from_skill_path(&entry.path))
        })
      })
      .or_else(|| per_root.values().next().map(|skill| skill.folder_name.clone()))
      .unwrap_or_else(|| sanitize_skill_id(&skill_name));

    let mut entries = BTreeMap::new();

    for root in &scanned_roots {
      if blocked_roots.contains(&root.id) {
        let blocked_path = previous_skill
          .and_then(|skill| skill.entries.get(&root.id))
          .map(|entry| entry.path.clone())
          .filter(|path| !path.is_empty())
          .unwrap_or_else(|| PathBuf::from(&root.path).join(&preferred_folder_name).to_string_lossy().to_string());
        entries.insert(
          root.id.clone(),
          SkillEntry {
            status: "block".to_string(),
            size: "n/a".to_string(),
            modified: "n/a".to_string(),
            hash: "unreadable".to_string(),
            path: blocked_path,
            is_linked: false,
            resolved_path: String::new(),
          },
        );
        continue;
      }

      if let Some(scanned_skill) = per_root.get(&root.id) {
        let status = if scanned_skill.hash == preferred_hash { "ok" } else { "warn" };
        entries.insert(
          root.id.clone(),
          SkillEntry {
            status: status.to_string(),
            size: format_size(scanned_skill.size_bytes),
            modified: relative_time(scanned_skill.modified),
            hash: short_hash(&scanned_skill.hash),
            path: scanned_skill.path.clone(),
            is_linked: scanned_skill.is_linked,
            resolved_path: scanned_skill.resolved_path.clone(),
          },
        );
      } else {
        entries.insert(
          root.id.clone(),
          SkillEntry {
            status: "miss".to_string(),
            size: "0kb".to_string(),
            modified: "n/a".to_string(),
            hash: "missing".to_string(),
            path: String::new(),
            is_linked: false,
            resolved_path: String::new(),
          },
        );
      }
    }

    skills.push(Skill {
      id: sanitize_skill_id(&skill_name),
      name: skill_name,
      preferred_root_id,
      entries,
    });
  }

  skills.sort_by(|left, right| left.name.cmp(&right.name));

  let summary = format!(
    "Scanned {} roots, found {} skills, {} blocked",
    scanned_roots.len(),
    skills.len(),
    blocked_roots.len()
  );

  ScanResult {
    roots: scanned_roots,
    skills,
    summary,
  }
}

fn inspect_directory(path: &str) -> PathInspection {
  match fs::metadata(path) {
    Ok(metadata) => {
      let is_dir = metadata.is_dir();
      let readable = is_dir;
      let is_skills_root = readable && has_skills_leaf_name(Path::new(path));
      PathInspection {
        path: path.to_string(),
        exists: true,
        is_dir,
        readable,
        is_skills_root,
        health: if readable && is_skills_root {
          "healthy".to_string()
        } else {
          "degraded".to_string()
        },
        can_copy: readable && is_skills_root,
        can_delete: readable && is_skills_root && is_windows_local_path(path),
        summary: if !is_dir {
          format!("{} is not a directory", path)
        } else if !is_skills_root {
          format!("{} must point directly to a skills folder", path)
        } else {
          format!("{} is a readable skills root", path)
        },
      }
    }
    Err(_) => PathInspection {
      path: path.to_string(),
      exists: false,
      is_dir: false,
      readable: false,
      is_skills_root: false,
      health: "degraded".to_string(),
      can_copy: false,
      can_delete: false,
      summary: format!("{} is not readable from the current runtime", path),
    },
  }
}

fn ensure_directory(path: &Path, label: &str) -> Result<(), String> {
  let metadata = fs::metadata(path).map_err(|error| format!("{} is not readable: {}", label, error))?;
  if metadata.is_dir() {
    Ok(())
  } else {
    Err(format!("{} is not a directory", label))
  }
}

fn ensure_skills_root(path: &Path, label: &str) -> Result<(), String> {
  ensure_directory(path, label)?;
  if has_skills_leaf_name(path) {
    Ok(())
  } else {
    Err(format!("{} must point directly to a skills folder", label))
  }
}

fn scan_root_dir(root_path: &Path) -> Result<Vec<ScannedSkill>, String> {
  ensure_skills_root(root_path, "root path")?;
  scan_direct_skill_dirs(root_path)
}

fn default_roots() -> Vec<Root> {
  let Some(home_dir) = current_home_dir() else {
    return Vec::new();
  };

  vec![
    make_default_root("win-agents", "Agent", "agents", home_dir.join(".agents").join("skills")),
    make_default_root(
      "win-opencode",
      "OpenCode",
      "opencode",
      home_dir.join(".config").join("opencode").join("skills"),
    ),
    make_default_root("win-codex", "Codex", "codex", home_dir.join(".codex").join("skills")),
    make_default_root("win-claude", "Claude", "claude", home_dir.join(".claude").join("skills")),
    make_default_root("win-gemini", "Gemini", "gemini", home_dir.join(".gemini").join("skills")),
    make_default_root(
      "win-antigravity",
      "Antigravity",
      "antigravity",
      home_dir.join(".antigravity").join("skills"),
    ),
    make_default_root("win-qwen", "Qwen", "qwen", home_dir.join(".qwen").join("skills")),
  ]
}

fn make_default_root(id: &str, label: &str, kind: &str, path: PathBuf) -> Root {
  Root {
    id: id.to_string(),
    label: label.to_string(),
    path: path.to_string_lossy().to_string(),
    visible: true,
    kind: kind.to_string(),
    health: "unknown".to_string(),
    can_copy: false,
    can_delete: false,
  }
}

fn current_home_dir() -> Option<PathBuf> {
  env::var_os("USERPROFILE")
    .map(PathBuf::from)
    .or_else(|| env::var_os("HOME").map(PathBuf::from))
}

fn scan_direct_skill_dirs(root_path: &Path) -> Result<Vec<ScannedSkill>, String> {
  let mut scanned = Vec::new();
  let mut seen_paths = BTreeSet::new();

  let entries = fs::read_dir(root_path).map_err(|error| error.to_string())?;

  for entry in entries.flatten() {
    let path = entry.path();
    let file_name = entry.file_name().to_string_lossy().to_string();
    if file_name == ".system" {
      continue;
    }

    let Ok(target_metadata) = fs::metadata(&path) else {
      continue;
    };
    if !target_metadata.is_dir() {
      continue;
    }

    let skill_file = path.join("SKILL.md");
    if !skill_file.is_file() {
      continue;
    }

    let is_linked = path_is_linked(&path);
    let resolved_path = if is_linked {
      canonicalize_display(&path)
    } else {
      String::new()
    };

    if let Ok(skill) = scan_skill_dir(root_path, &path, &skill_file, is_linked, resolved_path) {
      if seen_paths.insert(skill.path.clone()) {
        scanned.push(skill);
      }
    }
  }

  Ok(scanned)
}

fn scan_skill_dir(
  root_path: &Path,
  skill_dir: &Path,
  skill_file: &Path,
  is_linked: bool,
  resolved_path: String,
) -> Result<ScannedSkill, String> {
  let content = fs::read_to_string(skill_file).map_err(|error| error.to_string())?;
  let folder_name = skill_dir
    .file_name()
    .map(|value| value.to_string_lossy().to_string())
    .unwrap_or_else(|| "unknown-skill".to_string());
  let name = extract_frontmatter_name(&content).unwrap_or_else(|| folder_name.clone());
  let (size_bytes, modified) = summarize_dir(skill_dir);
  let relative_path = skill_dir
    .strip_prefix(root_path)
    .map_err(|error| error.to_string())?
    .to_path_buf();

  let mut hasher = Sha256::new();
  hasher.update(content.as_bytes());
  let hash = format!("{:x}", hasher.finalize());

  Ok(ScannedSkill {
    name,
    folder_name,
    relative_path,
    path: skill_dir.to_string_lossy().to_string(),
    is_linked,
    resolved_path,
    size_bytes,
    modified,
    hash,
  })
}

fn summarize_dir(dir: &Path) -> (u64, SystemTime) {
  let mut total_size = 0_u64;
  let mut latest_modified = SystemTime::UNIX_EPOCH;

  for entry in WalkDir::new(dir).into_iter().filter_map(Result::ok) {
    let file_name = entry.file_name().to_string_lossy();
    if file_name.contains("Zone.Identifier") {
      continue;
    }

    if let Ok(metadata) = entry.metadata() {
      if metadata.is_file() {
        total_size += metadata.len();
      }
      if let Ok(modified) = metadata.modified() {
        if modified > latest_modified {
          latest_modified = modified;
        }
      }
    }
  }

  (total_size, latest_modified)
}

fn copy_directory_recursive(source: &Path, target: &Path) -> Result<(), String> {
  for entry in WalkDir::new(source).into_iter().filter_map(Result::ok) {
    let relative = entry.path().strip_prefix(source).map_err(|error| error.to_string())?;
    let destination = target.join(relative);

    if entry.file_type().is_dir() {
      fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
      continue;
    }

    if entry.file_type().is_file() {
      if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
      }
      fs::copy(entry.path(), &destination).map_err(|error| error.to_string())?;
    }
  }

  Ok(())
}

fn has_skills_leaf_name(path: &Path) -> bool {
  path
    .components()
    .rev()
    .find_map(|component| match component {
      Component::Normal(value) => Some(value.to_string_lossy().to_string()),
      _ => None,
    })
    .is_some_and(|value| value.eq_ignore_ascii_case("skills"))
}

fn canonicalize_display(path: &Path) -> String {
  fs::canonicalize(path)
    .map(|resolved| resolved.to_string_lossy().to_string())
    .unwrap_or_default()
}

fn path_is_linked(path: &Path) -> bool {
  let Ok(metadata) = fs::symlink_metadata(path) else {
    return false;
  };

  if metadata.file_type().is_symlink() {
    return true;
  }

  is_reparse_dir(&metadata)
}

#[cfg(target_os = "windows")]
fn is_reparse_dir(metadata: &fs::Metadata) -> bool {
  use std::os::windows::fs::MetadataExt;

  const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
  metadata.is_dir() && (metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0
}

#[cfg(not(target_os = "windows"))]
fn is_reparse_dir(_: &fs::Metadata) -> bool {
  false
}

fn remove_existing_path(path: &Path) -> Result<(), String> {
  if !path.exists() {
    return Ok(());
  }

  let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
  if metadata.file_type().is_symlink() {
    fs::remove_file(path).or_else(|_| fs::remove_dir(path)).map_err(|error| error.to_string())
  } else if metadata.is_dir() {
    fs::remove_dir_all(path).map_err(|error| error.to_string())
  } else {
    fs::remove_file(path).map_err(|error| error.to_string())
  }
}

fn extract_frontmatter_name(content: &str) -> Option<String> {
  let stripped = content.strip_prefix("---")?;
  let end_index = stripped.find("\n---")?;
  let frontmatter = &stripped[..end_index];
  let yaml_value: serde_json::Value = serde_yaml::from_str(frontmatter).ok()?;
  yaml_value.get("name")?.as_str().map(ToString::to_string)
}

fn sanitize_skill_id(name: &str) -> String {
  name
    .chars()
    .map(|character| {
      if character.is_ascii_alphanumeric() {
        character.to_ascii_lowercase()
      } else {
        '-'
      }
    })
    .collect::<String>()
    .trim_matches('-')
    .to_string()
}

fn folder_name_from_skill_path(path: &str) -> Option<String> {
  let candidate = Path::new(path);
  candidate.file_name().map(|value| value.to_string_lossy().to_string())
}

fn is_windows_local_path(path: &str) -> bool {
  matches!(
    Path::new(path).components().next(),
    Some(Component::Prefix(prefix))
      if matches!(prefix.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
  )
}

fn format_size(bytes: u64) -> String {
  if bytes >= 1024 * 1024 {
    return format!("{}mb", (bytes as f64 / (1024.0 * 1024.0)).round() as u64);
  }
  let kb = ((bytes + 1023) / 1024).max(1);
  format!("{kb}kb")
}

fn short_hash(hash: &str) -> String {
  hash.chars().take(10).collect()
}

fn relative_time(time: SystemTime) -> String {
  let now = SystemTime::now();
  let duration = now
    .duration_since(time)
    .unwrap_or_else(|_| Duration::from_secs(0));

  let minutes = duration.as_secs() / 60;
  if minutes < 1 {
    return "just now".to_string();
  }
  if minutes < 60 {
    return format!("{minutes}m ago");
  }
  let hours = minutes / 60;
  if hours < 24 {
    return format!("{hours}h ago");
  }
  let days = hours / 24;
  format!("{days}d ago")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .invoke_handler(tauri::generate_handler![
      copy_text,
      open_path,
      inspect_path,
      bootstrap_config,
      scan_source,
      pick_folder,
      copy_skill,
      recycle_skill,
      scan_roots
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitize_skill_id_keeps_alnum_and_dashes() {
    assert_eq!(sanitize_skill_id("Frontend-Design"), "frontend-design");
    assert_eq!(sanitize_skill_id("Find Skills!"), "find-skills");
    assert_eq!(sanitize_skill_id("  spaced   name "), "spaced---name");
  }

  #[test]
  fn short_hash_truncates() {
    assert_eq!(short_hash("1234567890abcdef"), "1234567890");
    assert_eq!(short_hash("short"), "short");
  }

  #[test]
  fn format_size_rounds_kb_and_mb() {
    assert_eq!(format_size(1), "1kb");
    assert_eq!(format_size(1024), "1kb");
    assert_eq!(format_size(1024 * 1024), "1mb");
    assert_eq!(format_size(2 * 1024 * 1024 + 500), "2mb");
  }

  #[test]
  fn relative_time_formats_ranges() {
    let now = SystemTime::now();
    assert_eq!(relative_time(now), "just now");
    assert_eq!(relative_time(now - Duration::from_secs(60)), "1m ago");
    assert_eq!(relative_time(now - Duration::from_secs(60 * 60)), "1h ago");
    assert_eq!(relative_time(now - Duration::from_secs(60 * 60 * 24)), "1d ago");
  }

  #[test]
  fn folder_name_from_skill_path_extracts_leaf() {
    assert_eq!(
      folder_name_from_skill_path("C:\\Users\\l3e\\.agents\\skills\\find-skills"),
      Some("find-skills".to_string())
    );
    assert_eq!(
      folder_name_from_skill_path("/home/lee/.codex/skills/frontend-design"),
      Some("frontend-design".to_string())
    );
  }

  #[test]
  fn extract_frontmatter_name_reads_yaml() {
    let content = r#"---
name: sample-skill
description: "Example"
---

Body text here
"#;
    assert_eq!(
      extract_frontmatter_name(content),
      Some("sample-skill".to_string())
    );
    assert_eq!(extract_frontmatter_name("no frontmatter"), None);
  }

  #[test]
  fn is_windows_local_path_matches_drive_prefixes() {
    assert!(is_windows_local_path("C:\\Users\\l3e\\.config"));
    assert!(is_windows_local_path("\\\\?\\D:\\skills"));
    assert!(!is_windows_local_path("\\\\wsl.localhost\\Ubuntu\\home\\lee"));
    assert!(!is_windows_local_path("/home/lee/.codex"));
  }

  #[test]
  fn has_skills_leaf_name_only_matches_skills_dir() {
    assert!(has_skills_leaf_name(Path::new("C:\\Users\\l3e\\.codex\\skills")));
    assert!(has_skills_leaf_name(Path::new("/home/lee/.codex/skills")));
    assert!(!has_skills_leaf_name(Path::new("C:\\Users\\l3e\\.codex")));
  }

  #[test]
  fn inspect_directory_flags_non_skills_root() {
    let workspace = temp_test_dir("not-skills-root");
    let inspection = inspect_directory(workspace.to_string_lossy().as_ref());
    assert!(!inspection.is_skills_root);
    assert_eq!(inspection.health, "degraded");
    let _ = fs::remove_dir_all(workspace);
  }

  fn make_root(id: &str, path: &str, health: &str, can_copy: bool, can_delete: bool) -> Root {
    Root {
      id: id.to_string(),
      label: id.to_string(),
      path: path.to_string(),
      visible: true,
      kind: "system".to_string(),
      health: health.to_string(),
      can_copy,
      can_delete,
    }
  }

  #[test]
  fn make_default_root_marks_bootstrap_entries_unknown() {
    let root = make_default_root(
      "win-codex",
      "Codex",
      "codex",
      PathBuf::from("C:\\Users\\current\\.codex\\skills"),
    );
    assert_eq!(root.health, "unknown");
    assert!(!root.can_copy);
    assert!(!root.can_delete);
  }

  #[test]
  fn default_roots_follow_current_home_shape() {
    let home = PathBuf::from("C:\\Users\\current");
    let roots = vec![
      make_default_root("win-agents", "Agent", "agents", home.join(".agents").join("skills")),
      make_default_root(
        "win-opencode",
        "OpenCode",
        "opencode",
        home.join(".config").join("opencode").join("skills"),
      ),
      make_default_root("win-codex", "Codex", "codex", home.join(".codex").join("skills")),
    ];

    assert_eq!(roots[0].path, "C:\\Users\\current\\.agents\\skills");
    assert_eq!(roots[1].path, "C:\\Users\\current\\.config\\opencode\\skills");
    assert_eq!(roots[2].path, "C:\\Users\\current\\.codex\\skills");
  }

  fn make_scanned_skill(name: &str, folder: &str, path: &str, hash: &str) -> ScannedSkill {
    ScannedSkill {
      name: name.to_string(),
      folder_name: folder.to_string(),
      relative_path: PathBuf::from(folder),
      path: path.to_string(),
      is_linked: false,
      resolved_path: String::new(),
      size_bytes: 2048,
      modified: SystemTime::UNIX_EPOCH + Duration::from_secs(120),
      hash: hash.to_string(),
    }
  }

  fn entry_with_path(path: &str) -> SkillEntry {
    SkillEntry {
      status: "block".to_string(),
      size: "n/a".to_string(),
      modified: "n/a".to_string(),
      hash: "unreadable".to_string(),
      path: path.to_string(),
      is_linked: false,
      resolved_path: String::new(),
    }
  }

  fn temp_test_dir(label: &str) -> PathBuf {
    let unique = SystemTime::now()
      .duration_since(SystemTime::UNIX_EPOCH)
      .unwrap_or_else(|_| Duration::from_secs(0))
      .as_nanos();
    let path = std::env::temp_dir().join(format!("skillmanager-{label}-{unique}"));
    fs::create_dir_all(&path).unwrap();
    path
  }

  #[test]
  fn build_scan_result_marks_ok_warn_miss_block() {
    let roots = vec![
      make_root("root-a", "C:\\A", "healthy", true, true),
      make_root("root-b", "C:\\B", "healthy", true, true),
      make_root("root-c", "C:\\C", "degraded", false, false),
    ];
    let blocked_roots = BTreeSet::from(["root-c".to_string()]);
    let mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>> = BTreeMap::new();
    aggregated
      .entry("skill-one".to_string())
      .or_default()
      .insert(
        "root-a".to_string(),
        make_scanned_skill("skill-one", "skill-one", "C:\\A\\skill-one", "hash-1"),
      );
    aggregated
      .entry("skill-one".to_string())
      .or_default()
      .insert(
        "root-b".to_string(),
        make_scanned_skill("skill-one", "skill-one", "C:\\B\\skill-one", "hash-2"),
      );

    let result = build_scan_result(roots, &blocked_roots, aggregated, None);
    let skill = result.skills.iter().find(|skill| skill.name == "skill-one").unwrap();

    assert_eq!(skill.entries["root-a"].status, "ok");
    assert_eq!(skill.entries["root-b"].status, "warn");
    assert_eq!(skill.entries["root-c"].status, "block");
  }

  #[test]
  fn build_scan_result_prefers_previous_root_when_present() {
    let roots = vec![
      make_root("root-a", "C:\\A", "healthy", true, true),
      make_root("root-b", "C:\\B", "healthy", true, true),
    ];
    let blocked_roots = BTreeSet::new();
    let mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>> = BTreeMap::new();
    aggregated
      .entry("skill-two".to_string())
      .or_default()
      .insert(
        "root-a".to_string(),
        make_scanned_skill("skill-two", "skill-two", "C:\\A\\skill-two", "hash-1"),
      );
    aggregated
      .entry("skill-two".to_string())
      .or_default()
      .insert(
        "root-b".to_string(),
        make_scanned_skill("skill-two", "skill-two", "C:\\B\\skill-two", "hash-1"),
      );

    let previous = Skill {
      id: "skill-two".to_string(),
      name: "skill-two".to_string(),
      preferred_root_id: "root-b".to_string(),
      entries: BTreeMap::new(),
    };

    let result = build_scan_result(roots, &blocked_roots, aggregated, Some(vec![previous]));
    let skill = result.skills.iter().find(|skill| skill.name == "skill-two").unwrap();
    assert_eq!(skill.preferred_root_id, "root-b");
  }

  #[test]
  fn build_scan_result_backfills_blocked_paths() {
    let roots = vec![
      make_root("root-a", "C:\\A", "healthy", true, true),
      make_root("root-b", "C:\\B", "degraded", false, false),
    ];
    let blocked_roots = BTreeSet::from(["root-b".to_string()]);
    let mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>> = BTreeMap::new();
    aggregated
      .entry("skill-three".to_string())
      .or_default()
      .insert(
        "root-a".to_string(),
        make_scanned_skill("skill-three", "skill-three", "C:\\A\\skill-three", "hash-1"),
      );

    let mut previous_entries = BTreeMap::new();
    previous_entries.insert("root-b".to_string(), entry_with_path("C:\\B\\skill-three"));
    let previous = Skill {
      id: "skill-three".to_string(),
      name: "skill-three".to_string(),
      preferred_root_id: "root-a".to_string(),
      entries: previous_entries,
    };

    let result = build_scan_result(roots, &blocked_roots, aggregated, Some(vec![previous]));
    let skill = result
      .skills
      .iter()
      .find(|skill| skill.name == "skill-three")
      .unwrap();
    assert_eq!(skill.entries["root-b"].path, "C:\\B\\skill-three");
  }

  #[test]
  fn build_scan_result_falls_back_to_computed_blocked_path() {
    let roots = vec![
      make_root("root-a", "C:\\A", "healthy", true, true),
      make_root("root-b", "C:\\B", "degraded", false, false),
    ];
    let blocked_roots = BTreeSet::from(["root-b".to_string()]);
    let mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>> = BTreeMap::new();
    aggregated
      .entry("skill-four".to_string())
      .or_default()
      .insert(
        "root-a".to_string(),
        make_scanned_skill("skill-four", "skill-four", "C:\\A\\skill-four", "hash-1"),
      );

    let result = build_scan_result(roots, &blocked_roots, aggregated, None);
    let skill = result
      .skills
      .iter()
      .find(|skill| skill.name == "skill-four")
      .unwrap();
    assert_eq!(skill.entries["root-b"].path, "C:\\B\\skill-four");
  }

  #[test]
  fn scan_root_dir_only_reads_direct_skill_dirs() {
    let workspace = temp_test_dir("scan-root");
    let root = workspace.join("skills");
    fs::create_dir_all(&root).unwrap();

    let direct = root.join("skill-a");
    fs::create_dir_all(&direct).unwrap();
    fs::write(direct.join("SKILL.md"), "---\nname: skill-a\n---\n").unwrap();

    let nested_parent = root.join("group");
    let nested_skill = nested_parent.join("skill-b");
    fs::create_dir_all(&nested_skill).unwrap();
    fs::write(nested_skill.join("SKILL.md"), "---\nname: skill-b\n---\n").unwrap();

    let system_skill = root.join(".system");
    fs::create_dir_all(&system_skill).unwrap();
    fs::write(system_skill.join("SKILL.md"), "---\nname: system-skill\n---\n").unwrap();

    let scanned = scan_root_dir(&root).unwrap();
    let names = scanned.into_iter().map(|skill| skill.name).collect::<Vec<_>>();

    assert_eq!(names, vec!["skill-a".to_string()]);

    let _ = fs::remove_dir_all(workspace);
  }

  #[test]
  fn scan_source_returns_empty_for_invalid_root() {
    let workspace = temp_test_dir("invalid-source");
    let source = scan_source(workspace.to_string_lossy().to_string()).unwrap();
    assert_eq!(source.health, "healthy");
    assert!(source.skills.is_empty());
    let _ = fs::remove_dir_all(workspace);
  }
}
