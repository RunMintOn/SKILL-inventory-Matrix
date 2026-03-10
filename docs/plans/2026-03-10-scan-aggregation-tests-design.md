## Goal

Add deterministic, pure-function unit tests that cover scan aggregation logic without touching the file system.

## Scope

In scope:
- Extract scan aggregation into a pure function.
- Unit tests for status selection, preferred root selection, blocked path fallback, and root flag calculation.

Out of scope:
- End-to-end disk scanning tests.
- UI or Tauri invoke integration tests.

## Design

### New Pure Function

Introduce a pure helper that builds `ScanResult` from already-scanned inputs.

Proposed signature:

```
fn build_scan_result(
  roots: Vec<Root>,
  blocked_roots: &BTreeSet<String>,
  mut aggregated: BTreeMap<String, BTreeMap<String, ScannedSkill>>,
  previous_skills: Option<Vec<Skill>>,
) -> ScanResult
```

This function does not perform I/O. It only applies the existing aggregation rules:
- Derive `preferred_root_id` with fallbacks.
- Set `ok/warn/miss/block` status per root.
- Backfill blocked paths using prior entries or a computed path.
- Preserve overall summary.

### `scan_roots` Flow

`scan_roots` keeps I/O responsibilities:
- Scan each root and build `blocked_roots` + `aggregated`.
- Call `build_scan_result(...)` to produce the final `ScanResult`.

### Test Strategy

Tests will construct minimal in-memory data and assert deterministic outcomes.

Priority coverage (in order):
1. `ok/warn/miss/block` status selection.
2. `preferred_root_id` selection and fallback.
3. Blocked path fallback logic.
4. Root `health/can_copy/can_delete` calculations.

### Success Criteria

- `cargo test` runs without file system access.
- All tests pass deterministically.

