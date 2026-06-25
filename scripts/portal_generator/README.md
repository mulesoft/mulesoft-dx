# Portal Generator

The portal generator renders the public Anypoint API documentation portal from this repository's source-of-truth content: API specs under `apis/`, skills under `skills/`, MCP servers under `mcps/`, and Terraform provider docs under `terraform/`. The entry point is `scripts/generate_portal.py`; the output is the static HTML/CSS/JS bundle served as the public docs portal.

This README documents portal-generator-internal contracts that are not derivable from reading the surrounding code. For repo-wide topics (validation, governance, design system, etc.) see the root `README.md` and the `docs/` directory.

## Region contract

### Single source of truth

The valid combinations of Anypoint region × domain are defined exactly once, in `assets/portal.js`:

```js
var DOMAIN_REGIONS = {
    anypoint: ['us', 'eu1'],
    platform: ['ca1', 'jp1', 'in1']
};
```

- `anypoint` keys regions deployed on `*.anypoint.mulesoft.com`. `'us'` is the global `https://anypoint.mulesoft.com` endpoint (no subdomain) and is listed here so the matrix stays self-describing.
- `platform` keys regions deployed on `*.platform.mulesoft.com` (the Hyperforce control planes).

No region exists in both domains. The portal uses this matrix to filter region/domain combinations that have no deployed endpoint (e.g. `ca1.anypoint.mulesoft.com` does not exist) and to populate the auth-modal region preset.

### How to add a new region

1. Edit `DOMAIN_REGIONS` in `scripts/portal_generator/assets/portal.js`. Add the region code to either the `anypoint` array or the `platform` array, whichever matches the domain where it is deployed.
2. Regenerate the portal (`python3 scripts/generate_portal.py`, or whatever command the project uses for portal generation).
3. Confirm the new region appears in the auth modal's region preset dropdown when the matching server type is selected.
4. Optionally extend the existing tests in `scripts/tests/portal.test.js` — the `isServerValidForRegion`, `filterServersForRegion`, and `getValidRegionsForServerType` describe blocks already cover the region × domain invariant; new regions slot in naturally there.

No spec edits under `apis/` are required. The constant is authoritative.

### Why not in the OpenAPI specs

OpenAPI 3.0 forbids `$ref` inside `servers[].variables.<var>`, so a shared `regions.yaml` fragment that all specs reference is not legal OAS. The only spec-side alternative is to inline `enum: [ca1, jp1, ...]` per spec, which means adding a region forces touching every spec (currently dozens). The team evaluated this in commit `428a8e9` (W-22861359) and chose to centralize the contract in `portal.js` instead. If the team ever decides to make the OAS specs the source of truth — for example, because external consumers start reading them — the migration is documented in that commit's body.

### Consumers

The following functions in `assets/portal.js` read `DOMAIN_REGIONS`:

- `getValidRegionsForServerType(type)` — returns the region list for a given server type (`'eu'` or `'platform'`), used by the auth-modal region preset population.
- `filterServersForRegion(servers, region)` — narrows an API's `servers[]` array to those that match the selected region.
- `isServerValidForRegion(server, region)` — predicate behind `filterServersForRegion`; also used directly when the portal needs to decide whether a single template URL is reachable for the active region.
- `pickServerTemplate(servers)` — chooses the server template that matches the current server type (uses `DOMAIN_REGIONS` transitively via the above).

The auth-modal wiring (`onServerChange` in `portal.js`) calls `getValidRegionsForServerType` to rebuild the region preset's `<option>` list every time the user switches server type.

### Test coverage

The contract is verified by three describe blocks in `scripts/tests/portal.test.js`:

- `describe('isServerValidForRegion', ...)` — covers `eu1`, `ca1`, `jp1`, `in1` against anypoint-domain and platform-domain templates, plus legacy hardcoded URLs and unknown regions.
- `describe('filterServersForRegion', ...)` — asserts that each region narrows the server set to the matching domain.
- `describe('getValidRegionsForServerType', ...)` — asserts the exact region lists returned for each server type (including the order in which they appear in `DOMAIN_REGIONS`).

Run them with:

```bash
cd scripts && npx jest portal.test.js
```
