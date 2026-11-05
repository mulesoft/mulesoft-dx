#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Preflight for describe-connector (Step 7): ~/.m2/settings.xml must define
// the MuleSoft releases repository (https://repository.mulesoft.org/releases/),
// otherwise `dx mule describe-connector` exits 1 with no output. See
// lib/releases-repo.mjs for why.
//
// Usage:
//   node scripts/ensure_mulesoft_releases_repo.mjs            # check only (default)
//   node scripts/ensure_mulesoft_releases_repo.mjs --apply    # add it
//
// The check never writes. --apply edits the user's REAL settings.xml (after
// writing settings.xml.bak-<timestamp>) and must only be run after the user
// confirmed — the skill asks exactly once. Prints JSON to stdout.
import { checkReleasesRepo, applyReleasesRepo } from '../lib/releases-repo.mjs';

const apply = process.argv.includes('--apply');
const out = apply ? applyReleasesRepo() : checkReleasesRepo();
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
