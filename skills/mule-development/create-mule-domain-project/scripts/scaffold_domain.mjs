#!/usr/bin/env node
// scaffold_domain — write a new Mule 4 domain project to disk. The layout and
// file contents mirror what Anypoint Code Builder's "Create a Mule Domain
// Project" command generates (pom.xml with <packaging>mule-domain</packaging>,
// mule-artifact.json, src/main/mule/mule-domain-config.xml), plus a
// src/main/resources/domain.properties file registered through
// <configuration-properties> so shared resources can use ${placeholders}, and
// an empty src/test/munit folder.
//
// Usage:
//   node scripts/scaffold_domain.mjs <parent-dir> <domain-name> \
//     [--group-id com.mycompany] [--version 1.0.0-SNAPSHOT] \
//     [--runtime 4.9.0] [--java 17] \
//     [--region us|eu|ca|jp] [--exchange-url <maven-facade-url>]
//
// <domain-name> is converted to kebab-case; that value is both the folder name
// and the Maven artifactId. --exchange-url wins over --region; copy it from a
// sibling application's pom.xml so the domain resolves from the same Exchange.
//
// Prints a JSON summary ({projectDir, artifactId, files[]}) on stdout.
// Exit codes:
//   0  project written
//   1  bad arguments, invalid name/version, or target folder already exists

import { argv, exit, stderr, stdout } from 'node:process';
import { scaffoldDomain } from '../lib/domain-scaffold.mjs';

function parseArgs(args) {
  const positional = [];
  const opts = {};
  const keys = { '--group-id': 'groupId', '--version': 'version', '--runtime': 'runtime', '--java': 'java', '--region': 'region', '--exchange-url': 'exchangeUrl' };
  for (let i = 0; i < args.length; i++) {
    const key = keys[args[i]];
    if (key) {
      if (args[i + 1] === undefined) throw new Error(`${args[i]} needs a value`);
      opts[key] = args[++i];
    } else if (args[i].startsWith('--')) {
      throw new Error(`unknown option ${args[i]}`);
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, opts };
}

try {
  const { positional, opts } = parseArgs(argv.slice(2));
  if (positional.length !== 2) {
    throw new Error('usage: scaffold_domain.mjs <parent-dir> <domain-name> [--group-id G] [--version V] [--runtime R] [--java J] [--region us|eu|ca|jp] [--exchange-url URL]');
  }
  const result = scaffoldDomain(positional[0], positional[1], opts);
  stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (err) {
  stderr.write(`❌ ${err.message}\n`);
  exit(1);
}
