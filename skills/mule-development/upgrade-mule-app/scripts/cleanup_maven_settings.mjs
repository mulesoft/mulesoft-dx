#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Removes the temp settings.xml dir (holding a plaintext Exchange bearer
// token / client secret) that write_maven_settings.mjs created, once mvn is
// done reading it. Run this right after every `mvn -s "$MVN_SETTINGS" ...`
// call (Steps 3c, 16, 17, 18, verify_dependency_tree.mjs) so the credential
// doesn't linger in /tmp across retries.
//
// Safe to call with ANY path, including empty/null or the user's real
// ~/.m2/settings.xml (the `patched: false` case) — cleanupMavenSettings()
// only ever deletes a directory it can confirm it created itself. See
// lib/maven-settings.mjs for the exact safety check.
//
// Usage: node scripts/cleanup_maven_settings.mjs "$MVN_SETTINGS"
import { cleanupMavenSettings } from '../lib/maven-settings.mjs';

cleanupMavenSettings(process.argv[2]);
