# SkillManager

SkillManager is a Tauri desktop app for comparing, scanning, and managing agent `skills` folders across multiple roots.

## What It Does

- Scans multiple `skills` roots in one matrix view
- Shows where each skill is present, missing, drifted, or unreadable
- Lets you set one active source for copy operations
- Supports importing custom roots and managing them in the same root list

## Runtime Model

- The real product target is the Tauri desktop app
- Browser mode is only a static preview
- Browser mode does not inspect local folders, scan roots, copy skills, or recycle folders

## First-Time Setup

1. Add or confirm the roots you want to track
2. Make sure every root points directly to a `skills` folder
3. Choose one active source
4. Run a rescan

Imported custom roots are added into the same root overview list as the built-in roots.

## Project Structure

- `web/`: static frontend
- `src-tauri/`: desktop shell, filesystem access, and scan/copy/delete commands

## Local Development

You need a Tauri-capable local environment.

Typical desktop workflow:

```bash
cargo tauri dev
```

Basic Rust verification:

```bash
cd src-tauri
cargo check
cargo test
```

## Known Limits

- WSL roots are not auto-discovered in this version
- Browser mode is intentionally non-functional for local filesystem actions
- Release metadata such as versioning, identifier, and packaging policy should be reviewed before public release
