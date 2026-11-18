# LinkBooks originality and reference policy

**Effective:** 2026-11-18 (Batch 28)  
**Owner:** Premium UI programme  
**Hard rule:** Competitor screenshots may inform *workflow completeness* only. They must never be copied as visual design, branding, layout trade dress, iconography, or assets.

## Allowed use of references

Extract **capability principles** only, for example:

- Full-page transaction entry with breadcrumbs and document title
- Compact header fields (contact, dates, reference, currency/tax treatment)
- Spreadsheet-like editable line tables with add/remove row
- Totals summary anchored for scanning
- Sticky or persistently reachable Save / Approve / Cancel actions
- Notes, history, and attachments as supporting sections
- Native browser navigation (deep links, Back/Forward, new tab)

Record those principles in LinkBooks-owned language in [TRANSACTION_WORKSPACE_UX.md](./TRANSACTION_WORKSPACE_UX.md).

## Explicitly forbidden

| Forbidden | Why |
| --- | --- |
| Competitor logos, wordmarks, product names in UI chrome | Trademark / branding |
| Screen-for-screen reproduction of layouts | Trade dress risk |
| Distinctive competitor colour systems (e.g. Xero green primary actions, Odoo purple enterprise chrome, QBO green-tab facsimiles) | Brand recognition / mimicry |
| Copying competitor icon sets, status chevron motifs, or unique control shapes | Distinctive expression |
| Committing competitor screenshots into the product, public docs, or marketing site | Copyright in the images themselves |
| Porting competitor CSS, HTML, or component code | Copyright |

## Mandatory LinkBooks visual identity

| Element | LinkBooks expression |
| --- | --- |
| Shell | Existing `AppShell` navy sidebar + cool neutral workspace |
| Accent | Restrained LinkBooks primary blue from `theme.ts` / `styles.css` |
| Status | Semantic `StatusBadge` tones only (draft/posted/paid/overdue…) |
| Typography | Inter + IBM Plex Mono for money |
| Icons | Lucide only |
| Surfaces | Soft borders, `--lb-*` density tokens, card/rail chrome already in workspace components |
| Actions | Primary = LinkBooks `Button` default; secondary = outline/ghost — **do not** invent a green “Approve” brand colour to imitate references |

Theme presets (8 + custom) remain; palette changes must never rewrite semantic money/status colours.

## Engineering checklist (every visual PR)

1. Reuse `TransactionWorkspace` / `ListWorkspace` / `RecordWorkspace` — no parallel look-alike library.
2. Prefer LinkBooks tokens over hard-coded competitor-like greens/purples.
3. Wire real backends only; fail closed if an action is not authorised.
4. Update [COMPETITOR_GAP_AND_ORIGINALITY_MATRIX.md](./COMPETITOR_GAP_AND_ORIGINALITY_MATRIX.md) with principle gaps, not screenshot diffs.
5. Do not store reference screenshot binaries in `src/` or published marketing assets.

## Legal note

Counsel review remains **not-yet-verified** for public marketing claims. This policy reduces risk during product UI work; it is not a legal opinion.
