# Several provider accounts, one scanner

Push does **not** store provider credentials and does **not** use pull-scanner
cross-account feature flags (`aws-cross-account-scanning-enabled`,
`copilot-cross-account-scanning-enabled`,
`azure-ai-foundry-cross-account-scanning-enabled`). Those flags are for
MuleSoft-hosted pull scanners that keep one credential on the configuration.

A self-managed scanner is one configuration id, one asset type, one RUNNING
workspace. If the customer's assets live in several provider accounts,
projects, subscriptions, tenants, or orgs, the **generated script** lists each
of them and `/push`es every ZIP to **that same** configuration. Do not create
one scanner per account.

## When to ask

Ask only when their inventory or auth document names more than one account,
project, subscription, tenant, or org, or they say "all of my accounts".
Otherwise assume one account.

```text
These assets look split across more than one provider account. Should this script inventory all of them and push to the one scanner you created?

Reply with one-account, or with all-accounts and how this script authenticates to each (one credential that can assume into the others, or a list of credential sets). Do not paste secrets.
```

Then stop. Do not invent hub-and-spoke, Resource Graph, or a blank-project
walk unless **that document** describes it.

## What the script does

1. Keep `SCANNER_CONFIGURATION_ID` (or the one it just created). One type.
2. For each provider account in the approved list:
   - Authenticate with that account's fields from their document.
   - Run the identity/read test.
   - List and fetch only the baked `ASSET_TYPE`.
   - Build one ZIP per asset.
3. `/push` every ZIP to the same configuration. Concurrent uploads share the
   one RUNNING workspace.
4. One `/commit` at the end for the whole run.

Caps apply to the **run**, not per account: 1000 assets, 12 MB zip, 5 MB per
file. Stop at 1000 matching assets across all accounts (`truncated=true`,
`complete: false`).

## Identity

The ZIP directory name is the Exchange `assetId`. It must be unique **across
accounts**. If two accounts can emit the same provider id, prefix with a
stable account discriminator from their document (account id, project id,
subscription id, tenant id). Still ≤ 255 characters. Do not use the display
name.

A later `/push` of the same directory name **replaces** the staged object.
That is how a retry updates an asset. It is not how two accounts share an id.

## Auth shapes (only if their document has them)

| They documented | Implement |
|---|---|
| A list of credential sets (one key/token per account) | Loop the list. Names come from their document. Example keys: `PROVIDER_ACCOUNTS_FILE` pointing at a JSON array of non-secret ids plus env/file secrets per id |
| One credential that assumes into other accounts | The assume/sts/login call **from that document**, then list in each. Do not copy pull-scanner `hubRoleArn` / `spokeRoleName` / `externalId` unless those strings are in the paste |
| One credential that already sees every account | One login, then the list/filter their inventory describes |

Do not probe accounts. Do not use leftover `AWS_PROFILE` / `gcloud` / `az`
sessions unless the paste says the calls use that session. Do not send any
provider secret to MuleSoft.

## One account fails

- Identity test failed for that account: skip it, count as failed, continue
  the others, later `/commit` `complete: false`.
- List page failed after some ZIPs from that account were uploaded: stop that
  account, keep other accounts, `complete: false`.
- Expired creds for one account: remint once per `failure-and-retry.md`; if
  still 401, fail that account, continue others, `complete: false`.
- Do not abort the whole run because one of N accounts failed **unless** it
  was the first account and nothing is staged — then do not `/commit`.

Never tell them to enable a pull-scanner cross-account flag. Never tell them
to create N self-managed scanners to cover N accounts.
