# Light premium palette (Batch 33)

**Purpose:** Colour correction for long accounting sessions — airy, soft, eye-friendly.  
**Does not** replace the semantic colour system or create a second design system. Extends tokens in `src/styles.css`.

## Default light surfaces

| Role | Token | Value |
| --- | --- | --- |
| App background | `--background` | `#F7FAFC` |
| Card / popover | `--card` | `#FFFFFF` |
| Soft surface | `--secondary` / soft rails | `#FBFDFF` |
| Border / input | `--border` | `#E6EDF5` |
| Primary text | `--foreground` | `#1F2A37` |
| Secondary text | `--muted-foreground` | `#5B6B7F` |
| Primary blue | `--primary` | `#4F7DF3` |
| Selected soft blue | `--accent` / `--sidebar-active` | `#EEF4FF` |

## Semantic soft pairs (logic-based)

| Meaning | Soft bg | Ink |
| --- | --- | --- |
| Success | `#EAF8EF` | `#2F8F57` |
| Warning | `#FFF6E8` | `#B7791F` |
| Error | `#FDEDEE` | `#C94A4A` |
| Neutral | `#F3F6FA` | `#6B7A8C` |
| Info / approved | `#EEF4FF` | `#3D6AD6` |

## Navigator

Light mode uses a **white/soft sidebar** with soft blue selected rows — not dark navy blocks.  
Dark mode retains darker navigator surfaces for contrast when users choose dark theme.

Named palettes keep their accent personality but light-mode sidebars stay light and subtle.

## Soft chrome (Batches 34–35)

- Tabs / ModuleSubnav selected: `--accent` (`#EEF4FF`), not solid navy fills.
- Badges/alerts prefer `*-soft` / `*-ink` pairs.
- Tooltips use card surfaces (not solid primary fills).
- Dialog/sheet overlays use light `foreground/25` scrims.

## Rules

1. Colour mainly on selection, badges, buttons, icons, charts, progress, toasts, alerts.
2. Avoid large dark panels in light mode.
3. Semantic status/money tokens remain authoritative ([SEMANTIC_COLOUR_SYSTEM.md](./SEMANTIC_COLOUR_SYSTEM.md)).
