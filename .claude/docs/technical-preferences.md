# Technical Preferences

<!-- Populated by /setup-engine. Updated as the user makes decisions throughout development. -->
<!-- All agents reference this file for project-specific standards and conventions. -->

## Engine & Language

- **Engine**: Godot 4.7.1
- **Language**: GDScript
- **Rendering**: Compatibility (2D). Mobile renderer with Metal is an option on macOS — decide in an ADR (unverified for 4.7)
- **Physics**: None (card game — no physics simulation)

## Input & Platform

<!-- Written by /setup-engine. Read by /ux-design, /ux-review, /test-setup, /team-ui, and /dev-story -->
<!-- to scope interaction specs, test helpers, and implementation to the correct input methods. -->

- **Target Platforms**: macOS desktop app (changed from Web on 2026-11-25). Distribution channel not decided yet
- **Input Methods**: Mouse, Trackpad, Keyboard
- **Primary Input**: Mouse
- **Gamepad Support**: None
- **Touch Support**: None
- **Platform Notes**: Hover tooltips allowed, but the same info must also be reachable by click. Minimum click target 32px. Drag-and-drop for rule cards (click-to-place kept). Startup to workshop screen target 3s. macOS distribution needs Apple code signing and notarization (requires a Mac). Language stays GDScript (user decision).

## Naming Conventions

- **Classes**: PascalCase (e.g., `RuleCard`)
- **Variables**: snake_case (e.g., `hand_size`)
- **Signals/Events**: snake_case past tense (e.g., `card_played`)
- **Files**: snake_case matching class (e.g., `rule_card.gd`)
- **Scenes/Prefabs**: PascalCase matching root node (e.g., `RuleCard.tscn`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_PLAYERS`)

## Performance Budgets

- **Target Framerate**: 60 fps
- **Frame Budget**: 16.6 ms
- **Draw Calls**: 200 or fewer (2D card table, Compatibility renderer)
- **Memory Ceiling**: [TO BE CONFIGURED]
- **AI Turn Budget**: 0.5 s or less per computer move (validate in prototype)

## Testing

- **Framework**: GdUnit4
- **Minimum Coverage**: [TO BE CONFIGURED]
- **Required Tests**: Rule execution engine (rule cards → game flow), AI move selection, turn limit / draw handling

## Forbidden Patterns

<!-- Add patterns that should never appear in this project's codebase -->
- [None configured yet — add as architectural decisions are made]

## Allowed Libraries / Addons

<!-- Add approved third-party dependencies here -->
- [None configured yet — add as dependencies are approved]

## Architecture Decisions Log

<!-- Quick reference linking to full ADRs in docs/architecture/ -->
- [No ADRs yet — use /architecture-decision to create one]

## Engine Specialists

<!-- Written by /setup-engine when engine is configured. -->
<!-- Read by /code-review, /architecture-decision, /architecture-review, and team skills -->
<!-- to know which specialist to spawn for engine-specific validation. -->

- **Primary**: godot-specialist
- **Language/Code Specialist**: godot-gdscript-specialist (all .gd files)
- **Shader Specialist**: godot-shader-specialist (.gdshader files, VisualShader resources)
- **UI Specialist**: godot-specialist (no dedicated UI specialist — primary covers all UI)
- **Additional Specialists**: godot-gdextension-specialist (GDExtension / native C++ bindings only)
- **Routing Notes**: Invoke primary for architecture decisions, ADR validation, and cross-cutting code review. Invoke GDScript specialist for code quality, signal architecture, static typing enforcement, and GDScript idioms. Invoke shader specialist for material design and shader code. Invoke GDExtension specialist only when native extensions are involved.

### File Extension Routing

<!-- Skills use this table to select the right specialist per file type. -->
<!-- If a row says [TO BE CONFIGURED], fall back to Primary for that file type. -->

| File Extension / Type | Specialist to Spawn |
|-----------------------|---------------------|
| Game code (.gd files) | godot-gdscript-specialist |
| Shader / material files (.gdshader, VisualShader) | godot-shader-specialist |
| UI / screen files (Control nodes, CanvasLayer) | godot-specialist |
| Scene / prefab / level files (.tscn, .tres) | godot-specialist |
| Native extension / plugin files (.gdextension, C++) | godot-gdextension-specialist |
| General architecture review | godot-specialist |
