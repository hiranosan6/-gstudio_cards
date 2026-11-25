# Godot Engine — Version Reference

| Field | Value |
|-------|-------|
| **Engine Version** | Godot 4.7.1 |
| **Release Date** | Not verified (official release page could not be fetched) |
| **Project Pinned** | 2026-11-23 |
| **Last Docs Verified** | 2026-02-12 (covers up to 4.6 only) |
| **LLM Knowledge Cutoff** | May 2025 |
| **Risk Level** | HIGH — version is beyond LLM training data |

## Knowledge Gap Warning

The LLM's training data likely covers Godot up to ~4.3. Versions 4.4, 4.5,
4.6 and 4.7 introduced changes that the model does NOT know about.
Always cross-reference this directory before suggesting Godot API calls.

**4.6 → 4.7 changes are NOT yet documented here.** On 2026-11-23 the official
sites (godotengine.org, docs.godotengine.org) were not reachable from the cloud
session, so `breaking-changes.md`, `deprecated-apis.md` and
`current-best-practices.md` still stop at 4.6. Run `/setup-engine refresh`
once those hosts are reachable, and verify uncertain 4.7 APIs with WebSearch.

## Post-Cutoff Version Timeline

| Version | Release | Risk Level | Key Theme |
|---------|---------|------------|-----------|
| 4.4 | ~Mid 2025 | MEDIUM | Jolt physics option, FileAccess return types, shader texture type changes |
| 4.5 | ~Late 2025 | HIGH | Accessibility (AccessKit), variadic args, @abstract, shader baker, SMAA |
| 4.6 | Jan 2026 | HIGH | Jolt default, glow rework, D3D12 default on Windows, IK restored |
| 4.7 | 2026 (unverified) | HIGH | Not yet documented — see warning above |

## Project-Specific Notes

- Target is a macOS desktop app (changed from Web on 2026-11-25). Renderer: Compatibility for now; Metal-based renderer to be evaluated in an ADR.
- Language: GDScript only (user decision; the earlier C#-on-web concern no longer applies).
- macOS export: signing/notarization require a Mac with Xcode tools; unsigned builds can be produced on Linux for testing (verify for 4.7).

## Verified Sources

- Official docs: https://docs.godotengine.org/en/stable/
- 4.7.1 maintenance release: https://godotengine.org/article/maintenance-release-godot-4-7-1/
- Web export (4.7): https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html
- 4.5→4.6 migration: https://docs.godotengine.org/en/stable/tutorials/migrating/upgrading_to_godot_4.6.html
- 4.4→4.5 migration: https://docs.godotengine.org/en/stable/tutorials/migrating/upgrading_to_godot_4.5.html
- Changelog: https://github.com/godotengine/godot/blob/master/CHANGELOG.md
