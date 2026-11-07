# Competitor gap and originality matrix

**Method:** Principle-based usability benchmarks only. No competitor source, assets, trade dress or screen-for-screen layouts are copied.  
**Labels:** `existing-working` | `partially-implemented` | `missing` | `not-applicable` | `not-yet-verified`.

| Capability principle | LinkBooks today | Gap vs typical SaaS accounting UX | Original LinkBooks expression |
| -------------------- | --------------- | --------------------------------- | ----------------------------- |
| Native open-in-new-tab navigation | existing-working (`ModuleSubnav`, checks) | Competitors often use SPA-only buttons | Keep native `<Link>` everywhere |
| Semantic status ≠ health ≠ payment | existing-working (`StatusBadge`, status-badge map) | Often conflated colours | Distinct tones + labels + icons |
| Company-isolated search/commands | partially-implemented | Strong in mature ERPs | Permission-filtered GlobalSearch |
| Unified list workspace | partially-implemented | Ubiquitous | `ListWorkspace` + toolbar primitives |
| Related-record insight rail | missing / partial | Common “smart buttons” | Original `lb-insight-rail` pattern |
| Fail-closed scaffolds | partial (Batch 1) | Varies | Disabled actions until backend exists |
| Bank recon match suggestions | partially-implemented | Strong in Xero/QBO class | Transparent match reasons only |
| Multi-view Kanban on ledgers | not-applicable | Often overused | Explicitly refused for journals |
| Visual resemblance to Odoo | must remain absent | N/A | Independent IA, tokens, composition |

## Originality dossier (Batch 1 seed)

1. **Principles:** clarity, trusted money semantics, native browser behaviour, fail-closed actions.
2. **Wireframe rationale:** shell → subnav → page header → toolbar → dense table → optional insight rail.
3. **Tokens:** existing Inter + IBM Plex Mono, cool neutrals, single brand accent, semantic money/status tokens in `src/styles.css`.
4. **Icons:** Lucide only (already licensed via dependency).
5. **Differentiation:** navy sidebar + restrained blue accent; no Odoo purple enterprise chrome; no Xero green mimicry; no QBO green-tab facsimile.
6. **SBOM:** see `LEGAL_ASSET_LICENSE_REGISTER.md`.
7. **Legal review:** required before public marketing claims — counsel not yet engaged (`not-yet-verified`).

Update after each visual batch with side-by-side review notes.
