# CLI documentation ingestion — options + recommendation

## Options considered

| Option                                  | Source format       | Freshness | Effort per CLI | Repeatability | Auth/access | Notes |
|-----------------------------------------|---------------------|-----------|----------------|---------------|-------------|-------|
| Scrape rendered `docs.mulesoft.com`     | HTML → markdown     | Medium    | Low            | Fragile — HTML is not a stable contract | Public | Feasible today, brittle long term. Implemented in the PoC via `scripts/scrape_cli_doc.py`. The docs site now exposes a `.md` sibling for every page (via the "Copy as Markdown" button), which we prefer over HTML scraping — but the fallback is still HTML parsing. |
| Consume docs source repo (AsciiDoc)     | AsciiDoc → markdown | High      | Medium         | Very repeatable if repo layout is stable | Internal repo access required | Cleanest source of truth. Access + ownership need to be sorted with the docs team. |
| Parse `--help` output                   | plaintext → markdown| High      | Medium         | Repeatable if we standardize capture       | None (CLI must be installed at authoring time) | Only covers command surface, not conceptual docs. |
| Native content in this repo             | markdown            | Low       | High           | Not repeatable at scale                    | None | Only viable for tiny, curated set. Used for sf CLI in the PoC. |

## Recommendation

Move to **markdown-repo** ingestion for MuleSoft-owned CLIs (Anypoint CLI et al.) once we can secure read access to the docs source repo. It's the only option with high freshness AND high repeatability without HTML fragility.

Keep **scrape** as the fallback for CLIs we don't own the docs for (e.g. sf CLI), automated via a scheduled job that regenerates the markdown into the repo. Never call scrapers at build time — the generator must always read pre-committed markdown.

## Out of scope (deliberately)

- Scheduling / cache invalidation of the scrape pipeline.
- Handling docs versioning (multiple CLI versions in the portal).
- Search across CLI docs.
