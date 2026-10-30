#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// CLI entry point for lib/maven-settings.mjs. Run before every direct `mvn`
// invocation the skill makes (baseline build Step 3c, Step 16, Step 17,
// verify_dependency_tree.mjs) so a stale Exchange session credential in
// ~/.m2/settings.xml doesn't silently break private-connector resolution.
// See lib/maven-settings.mjs for why this is needed independently of
// DX_PLUGIN_MIN_LABEL (lib/anypoint.mjs) — that floor covers the DX plugin's
// OWN describe-connector subprocess, not the skill's `mvn` calls.
//
// Usage: node scripts/write_maven_settings.mjs
// Prints JSON: { path, patched, credentialKind, warning? } to stdout.
// `path` is null when ~/.m2/settings.xml does not exist — callers MUST omit
// `-s` in that case rather than pass a nonexistent path, e.g.
// `mvn ${MVN_SETTINGS:+-s "$MVN_SETTINGS"} ...`. Whenever path is non-null
// it is always safe to pass as `mvn -s <path>`. Never prints or logs any
// credential value. Once mvn is done with the temp settings file, callers
// should run `node scripts/cleanup_maven_settings.mjs "$MVN_SETTINGS"` to
// remove the plaintext credential from /tmp.
import { stdout } from 'node:process';
import { writeMavenSettings } from '../lib/maven-settings.mjs';

stdout.write(JSON.stringify(writeMavenSettings(), null, 2) + '\n');
