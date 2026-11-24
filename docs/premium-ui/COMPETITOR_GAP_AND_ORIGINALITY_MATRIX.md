# Competitor gap and originality matrix

**Method:** Principle-based usability benchmarks only. No competitor source, assets, trade dress or screen-for-screen layouts are copied.  
**Labels:** `existing-working` | `partially-implemented` | `missing` | `not-applicable` | `not-yet-verified`.

| Capability principle | StreakBooks today | Gap vs typical SaaS accounting UX | Original StreakBooks expression |
| -------------------- | --------------- | --------------------------------- | ----------------------------- |
| Native open-in-new-tab navigation | existing-working (`ModuleSubnav`, checks) | Competitors often use SPA-only buttons | Keep native `<Link>` everywhere |
| Semantic status ≠ health ≠ payment | existing-working (`StatusBadge`, status-badge map) | Often conflated colours | Distinct tones + labels + icons |
| Company-isolated search/commands | partially-implemented | Strong in mature ERPs | Permission-filtered GlobalSearch |
| Unified list workspace | partially-implemented | Ubiquitous | `ListWorkspace` + toolbar primitives |
| Related-record insight rail | partial (Batch 12) | Common “smart buttons” | Original `WorkspaceInsights` + `lb-insight-rail`; ledger/link facts only — no fabricated AI |
| Fail-closed scaffolds | partial (Batch 1) | Varies | Disabled actions until backend exists |
| Bank recon match suggestions | partially-implemented | Strong in Xero/QBO class | Transparent match reasons only |
| Multi-view Kanban on ledgers | not-applicable | Often overused | Explicitly refused for journals |
| Visual resemblance to Odoo | must remain absent | N/A | Independent IA, tokens, composition |
| Visual resemblance to Xero / QBO trade dress | must remain absent | N/A | No green primary Save/Approve brands; no boxed top-nav facsimile; see ORIGINALITY_AND_REFERENCE_POLICY.md |
| Transaction entry completeness (bill/invoice/PO/money/journal) | partial (Batches 25–27) | Mature tools expose dense grids + sticky actions | Original `TransactionWorkspace` + FormGrid + EditableLineItemGrid |
| Notes / history / attachments under the fold | partial | Common | Reuse DocumentRecordPanel — do not clone competitor “History & Notes” chrome |

## Originality dossier (Batch 1 seed + Batch 28 reinforcement)

1. **Principles:** clarity, trusted money semantics, native browser behaviour, fail-closed actions.
2. **Wireframe rationale:** AppShell sidebar → module subnav → page header → FormGrid → dense table → TotalsSummary → support panels.
3. **Tokens:** existing Inter + IBM Plex Mono, cool neutrals, single brand accent, semantic money/status tokens in `src/styles.css`; density `--lb-*` from Batch 25.
4. **Icons:** Lucide only (already licensed via dependency).
5. **Differentiation:** navy sidebar + restrained blue accent; no Odoo purple enterprise chrome; no Xero green mimicry; no QBO green-tab facsimile; no status chevron ribbons.
6. **References:** screenshots may be viewed offline for workflow cues; **never** committed into `src/` or marketing.
7. **SBOM:** see `LEGAL_ASSET_LICENSE_REGISTER.md`.
8. **Policy:** [ORIGINALITY_AND_REFERENCE_POLICY.md](./ORIGINALITY_AND_REFERENCE_POLICY.md).
9. **Legal review:** required before public marketing claims — counsel not yet engaged (`not-yet-verified`).

Update after each visual batch with principle gaps only — never screenshot diffs that encourage mimicry.
