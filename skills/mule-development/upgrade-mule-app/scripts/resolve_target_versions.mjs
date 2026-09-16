#!/usr/bin/env node
//
// Copyright (c) 2026, Salesforce, Inc.
// All rights reserved.
// For full license text, see the LICENSE.txt file
//
// Part of upgrade-mule-app skill.
//
// Step 4 helper — determine the single recommended upgrade target from the
// current Mule Runtime + Java versions and the live runtime list.
//
// Rules:
//   * Channel is sticky. Never cross channels, even if the other channel offers
//     a higher runtime.
//     - LTS minors are hardcoded (STOPGAP) until the runtime-list API exposes a
//       `channel` field: see LTS_MINORS below. Everything else post-cadence is
//       Edge. 4.3/4.4 predate the Edge/LTS cadence and are treated as
//       LTS-lineage (target the latest LTS).
//   * ONE recommended target: the highest minor in the current channel, at its
//     latest patch, on that runtime's latest non-EOL Java (17 today).
//       - Below the highest minor  -> minor upgrade  (e.g. 4.6.x -> 4.9.19 + 17).
//       - Already on the highest minor -> patch upgrade to its latest patch
//         (e.g. 4.9.5 -> 4.9.19). Patch is ONLY offered on the highest minor.
//   * Java target is always the latest non-EOL Java (Java 8 and 11 are EOL /
//     discouraged and are NEVER an upgrade target). We do not offer a
//     "keep Java 8/11" path — every Mule upgrade also moves Java to 17.
//   * There is NO standalone Java-only upgrade path (revisit when Java 25 ships).
//     A bare Java mention is not a distinct target — see TARGET_JAVA below.
//   * Intermediate minors (e.g. 4.4 -> 4.6) are NOT recommended by default; the
//     agent only pursues one if the user explicitly asks.
//   * Already on the highest minor's latest patch AND latest Java -> nothing to
//     upgrade.
//
// User-requested targets (env TARGET_MULE / TARGET_JAVA) are validated alongside
// the recommendation, never instead of it:
//   * TARGET_MULE named -> validateRequestedTarget(): refuse a downgrade/same
//     version, an EOL target Java, an unsupported Mule+Java combo, or a version
//     not in the runtime list (only a bare minor resolves to its latest patch).
//     An accepted cross-channel switch (LTS<->Edge) is flagged crossChannel +
//     warning; an accepted in-channel target below the latest is flagged
//     belowRecommended + note.
//   * TARGET_JAVA only (no TARGET_MULE) -> NOT a distinct target. We still show
//     the recommendation (it already moves Java to the latest non-EOL). If the
//     named Java isn't the one we'd land on (EOL 8/11, or unsupported like 21),
//     buildRequestedJavaOnly() attaches a note pointing at what we support.
//
// Data sources:
//   * Runtime list + compatibleJDKs — LIVE via `anypoint-cli-v4 dx mule runtime
//     list --output json`. Sole source; no bundled fallback. Each minor's entry
//     is already its latest patch (the CLI returns one row per minor).
//   * Channel (LTS/Edge) — hardcoded LTS_MINORS stopgap (see above), because the
//     runtime-list API does not yet return a channel field.
//
// Usage:
//   node resolve_target_versions.mjs [projectDir]
//   Reads current versions from <projectDir>/tmp/current-mule-version.json and
//   current-java-version.json (Step 2 output), unless overridden by env:
//     CURRENT_MULE=4.6.32 CURRENT_JAVA=8   (for testing all scenarios)
//   Optionally set TARGET_MULE / TARGET_JAVA to validate a user-requested target.
//   Output path: ${TARGET_VERSIONS_FILE} when set, else
//   <projectDir>/tmp/target-versions.json.
//
// Output JSON (file): { currentMule, currentJava, currentMinor, channel,
//   options: [ { kind, mule, java, muleChanged, javaChanged, patchOnly, note } ],
//   requestedTarget: { accepted, mule, java, reasonCode, reason, crossChannel,
//     warning, belowRecommended, note } | null,
//   requestedJavaOnly: { java, supported, supportedJavas, recommendedMule,
//     recommendedJava, note } | null,
//   nothingToUpgrade, runtimeSource, needsUserPrompt, warnings[], notes[] }.
//
// Exit code:
//   0  always — advisory; the caller branches on the fields.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

process.stdout.on("error", (e) => { if (e.code === "EPIPE") process.exit(0); });
function log(msg) { process.stdout.write(msg + "\n"); }

// STOPGAP: LTS minors, maintained by hand until the runtime-list API returns a
// `channel` field. Everything else post-cadence is Edge. Update this one list
// when MuleSoft designates a new LTS minor.
const LTS_MINORS = ["4.6", "4.9"];
// 4.3/4.4 predate the Edge/LTS cadence; treat them as LTS-lineage.
const LEGACY_MINORS = ["4.3", "4.4"];

// EOL / discouraged Java versions we NEVER recommend as an upgrade target. The
// Java target is always the runtime's latest compatible Java that is NOT in this
// set (17 today). Update when a version reaches EOL (e.g. add "17" once 25 GA's
// and 17 is being sunset).
const DISCOURAGED_JAVA = ["8", "11"];

// --- version helpers -------------------------------------------------------

// "4.9.19" / "4.4.0-20250919" -> "4.9" / "4.4"
function minorOf(version) {
  const m = String(version).match(/^(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}` : null;
}
function numericParts(v) {
  const m = String(v).match(/^\d+(?:\.\d+)*/);
  return m ? m[0].split(".").map(Number) : [];
}
function compareVersions(a, b) {
  const pa = numericParts(a), pb = numericParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
// Java spec number from a JDK entry: description "17" preferred, else parse
// "17.0.13_11" -> "17", "1.8"/"8.0.472_8" -> "8".
function javaSpecOf(jdk) {
  if (jdk && jdk.description) return String(jdk.description).trim();
  const v = String(jdk && jdk.version || "");
  const m18 = v.match(/^1\.(\d+)/);
  if (m18) return m18[1];
  const m = v.match(/^(\d+)/);
  return m ? m[1] : null;
}
function channelOfMinor(minor) {
  if (LEGACY_MINORS.includes(minor)) return "LTS";  // 4.3/4.4 -> LTS-lineage
  if (LTS_MINORS.includes(minor)) return "LTS";
  return "Edge";
}

// --- data source -----------------------------------------------------------

function loadRuntimes(result) {
  // Test-only override: a stubbed runtime list injected via RUNTIME_LIST_JSON
  // lets the harness assert the policy deterministically with no CLI/network.
  // Never set in production — the live CLI below is the sole real source.
  if (process.env.RUNTIME_LIST_JSON) {
    try {
      const json = JSON.parse(process.env.RUNTIME_LIST_JSON);
      if (Array.isArray(json) && json.length) {
        result.runtimeSource = "runtime-list-env-stub";
        return json;
      }
    } catch (e) {
      result.warnings.push(`RUNTIME_LIST_JSON set but not valid JSON (${e.message.split("\n")[0]}).`);
    }
  }
  // Live CLI is the sole source of truth for runtime versions + compatibleJDKs.
  // No bundled fallback — if the call fails, we stop and let the agent surface
  // it rather than reason from stale cached data.
  try {
    const out = execFileSync(
      "anypoint-cli-v4",
      ["dx", "mule", "runtime", "list", "--output", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const json = JSON.parse(out.slice(out.indexOf("[")));
    if (Array.isArray(json) && json.length) {
      result.runtimeSource = "runtime-list-cli";
      return json;
    }
    result.warnings.push("`dx mule runtime list` returned no versions.");
  } catch (e) {
    result.warnings.push(
      `Could not fetch the runtime list (${e.message.split("\n")[0]}). ` +
      `Check network/authentication (anypoint-cli-v4 conf) and re-run.`
    );
  }
  return [];
}

// --- current-version inputs ------------------------------------------------

function readCurrent(projectDir, result) {
  let mule = process.env.CURRENT_MULE || null;
  let java = process.env.CURRENT_JAVA || null;
  if (!mule) {
    const p = join(projectDir, "tmp", "current-mule-version.json");
    if (existsSync(p)) { try { mule = JSON.parse(readFileSync(p, "utf8")).version; } catch {} }
  }
  if (!java) {
    const p = join(projectDir, "tmp", "current-java-version.json");
    if (existsSync(p)) { try { java = JSON.parse(readFileSync(p, "utf8")).version; } catch {} }
  }
  if (!mule || !java) {
    result.needsUserPrompt = true;
    if (!mule) result.warnings.push("No current Mule version (run Step 2a or set CURRENT_MULE).");
    if (!java) result.warnings.push("No current Java version (run Step 2b or set CURRENT_JAVA).");
  }
  return { mule, java: java != null ? String(java) : null };
}

// --- core logic ------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  let projectDir = process.cwd();
  for (const a of argv) if (!a.startsWith("--")) projectDir = resolve(a);
  projectDir = resolve(projectDir);
  const outPath = process.env.TARGET_VERSIONS_FILE || join(projectDir, "tmp", "target-versions.json");

  const result = {
    projectDir,
    currentMule: null, currentJava: null, currentMinor: null, channel: null,
    // options[] holds the upgrade paths. The RECOMMENDED path is always the
    // latest Mule (highest minor, latest patch) in the channel + that runtime's
    // latest non-EOL Java. Today exactly one entry survives:
    //   - current Java 8/11 (EOL) -> one "java-and-mule" (moves to latest Java)
    //   - current Java 17+        -> one "mule-only"     (keep Java, bump Mule)
    // A second, distinct option only appears once a newer non-EOL Java ships
    // (e.g. Java 25), when a 17 user could choose keep-17 vs move-to-25.
    // Intermediate minors are NOT shown here — the agent pursues one only if the
    // user explicitly asks.
    options: [],
    // Set only when the user explicitly requested a specific target
    // (TARGET_MULE): { accepted, mule, java, reasonCode, reason, crossChannel,
    // warning, belowRecommended, note }. When accepted && crossChannel, the agent
    // MUST surface `warning` (channel switch) before proceeding; when accepted &&
    // belowRecommended, surface `note` (target is valid but not the latest).
    requestedTarget: null,
    // Set when the user named ONLY a Java (TARGET_JAVA, no TARGET_MULE) that
    // differs from the recommended one: { java, supported, supportedJavas[],
    // recommendedMule, recommendedJava, note }. Lets the agent tell the user their
    // Java (EOL 8/11, or unsupported like 21) isn't a target and show what we support.
    requestedJavaOnly: null,
    nothingToUpgrade: false,
    runtimeSource: null,
    needsUserPrompt: false,
    warnings: [], notes: [],
  };

  const { mule, java } = readCurrent(projectDir, result);
  if (result.needsUserPrompt) return emit(result, outPath);
  result.currentMule = mule;
  result.currentJava = java;
  result.currentMinor = minorOf(mule);
  result.channel = channelOfMinor(result.currentMinor);

  const runtimes = loadRuntimes(result);
  if (!runtimes.length) {
    result.needsUserPrompt = true;
    result.warnings.push("No runtime data available (CLI and fallback both empty).");
    return emit(result, outPath);
  }

  // If the user explicitly asked for a specific target (TARGET_MULE), validate
  // THAT instead of only recommending. We still compute + surface the
  // recommendation below so the agent can show it alongside. Rules:
  //   - target Mule must be strictly higher than current (no downgrade / same;
  //     covers off-channel upgrades too — channel gates recommendation, not
  //     what's allowed).
  //   - target Java must be non-EOL (never keep/select Java 8/11).
  //   - target Mule must support the target Java (buildable combo).
  //   - if no target Java given, pair with the target Mule's latest non-EOL Java.
  // Only validate a requested target when a Mule version is named. A Java-only
  // mention (TARGET_JAVA, no TARGET_MULE) is handled after the recommendation
  // below, since the recommendation already moves Java to the latest non-EOL.
  const reqMule = process.env.TARGET_MULE || null;
  const reqJava = process.env.TARGET_JAVA || null;
  if (reqMule) {
    result.requestedTarget = validateRequestedTarget(reqMule, reqJava, mule, runtimes);
  }

  // Out-of-matrix guard: if the current minor isn't represented at all, we have
  // no compatibility data to reason from — stop and let the agent ask.
  const knownMinors = new Set(runtimes.map((r) => minorOf(r.version)));
  const currentIsLegacy = LEGACY_MINORS.includes(result.currentMinor);
  if (!knownMinors.has(result.currentMinor) && !currentIsLegacy) {
    result.needsUserPrompt = true;
    result.warnings.push(
      `Current Mule minor ${result.currentMinor} is not in the supported runtimes list; ` +
      `no compatibility data to recommend a target. Ask the user how to proceed.`
    );
    return emit(result, outPath);
  }

  // The recommended target is the highest minor in the channel (at its latest
  // patch — the CLI returns one row per minor, already the latest patch). We
  // include the CURRENT minor as a candidate so a user already on the highest
  // minor can still be moved to its latest patch (patch is only ever offered on
  // the highest minor).
  const sameChannelAtOrAbove = runtimes
    .filter((r) => channelOfMinor(minorOf(r.version)) === result.channel)
    .filter((r) => compareVersions(minorOf(r.version) + ".0", result.currentMinor + ".0") >= 0);

  if (!sameChannelAtOrAbove.length) {
    // No runtime in the channel at/above the current minor — nothing to work
    // with (legacy 4.4 always has higher LTS minors, so this is rare).
    result.nothingToUpgrade = true;
    result.notes.push(`No higher runtime available in your current channel (${result.channel}).`);
    return emit(result, outPath);
  }

  // Highest minor in channel = the recommended Mule target (latest patch of it).
  const highest = sameChannelAtOrAbove
    .slice()
    .sort((a, b) => compareVersions(a.version, b.version))
    .pop();
  const targetMule = highest.version;
  const targetJava = pickLatestNonEolJava(highest);

  if (!targetJava) {
    result.needsUserPrompt = true;
    result.warnings.push(
      `The highest ${result.channel} runtime (${targetMule}) lists no non-EOL ` +
      `Java to upgrade to. Ask the user how to proceed.`
    );
    return emit(result, outPath);
  }

  const muleChanged = compareVersions(targetMule, mule) > 0;
  const javaChanged = String(targetJava) !== String(java);

  // Nothing to upgrade: already on the highest minor's latest patch AND already
  // on the target (latest non-EOL) Java.
  if (!muleChanged && !javaChanged) {
    result.nothingToUpgrade = true;
    result.notes.push(
      `Already on the latest ${result.channel} runtime (${targetMule}) and Java ${targetJava}.`
    );
    // Even with nothing to upgrade, if the user named an unsupported Java we
    // still tell them what we support (never silently drop the mention).
    result.requestedJavaOnly = buildRequestedJavaOnly(reqMule, reqJava, highest, targetMule, targetJava, result.channel);
    return emit(result, outPath);
  }

  // Kind reflects whether Java moves:
  //   - current Java already == target Java  -> "mule-only" (Mule/patch bump).
  //   - current Java is EOL (8/11) or lower   -> "java-and-mule" (Java moves up).
  const kind = javaChanged ? "java-and-mule" : "mule-only";
  const patchOnly = !javaChanged && minorOf(targetMule) === result.currentMinor;

  const option = {
    kind,
    mule: targetMule,
    java: String(targetJava),
    muleChanged,
    javaChanged,
    patchOnly,          // true when this is a same-minor latest-patch bump
    note: null,
  };
  if (DISCOURAGED_JAVA.includes(String(java))) {
    option.note =
      `Java ${java} is end-of-life; the upgrade moves you to the latest ` +
      `supported Java (${targetJava}).`;
  }

  result.options = [option];

  // If the user's accepted target is lower than the recommendation (e.g. an
  // in-channel intermediate 4.4->4.6 when 4.9 is the latest), flag that it isn't
  // the latest so the agent can show both and let the user choose.
  const rt = result.requestedTarget;
  if (rt && rt.accepted && !rt.crossChannel && compareVersions(rt.mule, targetMule) < 0) {
    rt.belowRecommended = true;
    rt.note =
      `Mule ${rt.mule} is a valid target but not the latest ${result.channel} ` +
      `runtime. We recommend Mule ${targetMule} on Java ${targetJava}.`;
  }

  result.requestedJavaOnly = buildRequestedJavaOnly(reqMule, reqJava, highest, targetMule, targetJava, result.channel);

  return emit(result, outPath);
}

// Find the runtime-list entry matching a requested Mule version. We only support
// what the runtime list carries — nothing else:
//   - Exact version (4.9.19) -> must match a row exactly.
//   - Bare minor (4.9)       -> that minor's latest-patch row.
// A full x.y.z that isn't in the list (e.g. 4.9.10) is NOT resolved up to the
// minor's latest patch — it returns null so the caller refuses it as an unknown
// version, rather than silently substituting a different patch.
function findRuntimeForRequest(runtimes, reqMule) {
  const exact = runtimes.find((r) => String(r.version) === String(reqMule));
  if (exact) return exact;
  // Only a bare minor (exactly major.minor, no patch) falls back to latest patch.
  if (!/^\d+\.\d+$/.test(String(reqMule).trim())) return null;
  const wantMinor = minorOf(reqMule);
  const ofMinor = runtimes
    .filter((r) => minorOf(r.version) === wantMinor)
    .sort((a, b) => compareVersions(a.version, b.version));
  return ofMinor.length ? ofMinor[ofMinor.length - 1] : null;
}

// Validate a user-requested target against the locked policy. Returns
// { accepted, mule, java, reasonCode, reason, crossChannel, warning }.
// reasonCode is one of: downgrade | eol-java | unsupported-combo |
// unknown-version. `crossChannel` is true when an ACCEPTED target switches
// support channels (LTS<->Edge); `warning` then carries the message the agent
// must surface before proceeding (PM-confirmed: allow cross-channel upgrades,
// but warn). Recommendation stays in-channel regardless.
function validateRequestedTarget(reqMule, reqJava, currentMule, runtimes) {
  const rt = findRuntimeForRequest(runtimes, reqMule);
  if (!rt) {
    return {
      accepted: false, mule: reqMule, java: reqJava, reasonCode: "unknown-version",
      reason: `Mule ${reqMule} is not in the supported runtimes list; cannot validate it.`,
    };
  }
  const targetMule = rt.version;

  // Rule 5 (and #2 "upgrades only"): must be strictly higher than current.
  if (compareVersions(targetMule, currentMule) <= 0) {
    return {
      accepted: false, mule: targetMule, java: reqJava, reasonCode: "downgrade",
      reason: `Mule ${targetMule} is not higher than your current ${currentMule}. ` +
              `This skill only upgrades — it never downgrades or re-targets the same version.`,
    };
  }

  // Resolve the Java to pair. If the user gave one, honor+validate it; else pick
  // the target runtime's latest non-EOL Java.
  let targetJava;
  if (reqJava != null && String(reqJava) !== "") {
    // Rule 3: never keep/select an EOL Java.
    if (DISCOURAGED_JAVA.includes(String(reqJava))) {
      return {
        accepted: false, mule: targetMule, java: String(reqJava), reasonCode: "eol-java",
        reason: `Java ${reqJava} is end-of-life. This skill upgrades apps off EOL Java ` +
                `(8/11); pick a supported Java (e.g. ${pickLatestNonEolJava(rt)}).`,
      };
    }
    // Rule 4: target Mule must actually support the requested Java.
    if (!runtimeSupportsJava(rt, reqJava)) {
      return {
        accepted: false, mule: targetMule, java: String(reqJava), reasonCode: "unsupported-combo",
        reason: `Mule ${targetMule} does not support Java ${reqJava}. ` +
                `Supported: ${supportedJavas(rt).join(", ") || "(none)"}.`,
      };
    }
    targetJava = String(reqJava);
  } else {
    targetJava = pickLatestNonEolJava(rt);
    if (!targetJava) {
      return {
        accepted: false, mule: targetMule, java: null, reasonCode: "unsupported-combo",
        reason: `Mule ${targetMule} lists no non-EOL Java to pair with.`,
      };
    }
  }

  // Accepted. Flag cross-channel switches (LTS<->Edge) so the agent warns the
  // user before proceeding. Legacy 4.4 is LTS-lineage, so 4.4->LTS is in-channel.
  const currentChannel = channelOfMinor(minorOf(currentMule));
  const targetChannel = channelOfMinor(minorOf(targetMule));
  const crossChannel = currentChannel !== targetChannel;
  const warning = crossChannel
    ? `Mule ${targetMule} is on the ${targetChannel} channel, but your app is on ` +
      `${currentChannel}. This upgrade switches support channels (${currentChannel} → ` +
      `${targetChannel}). We recommend staying on ${currentChannel}; proceed only if ` +
      `you intend to change channels.`
    : null;
  return {
    accepted: true, mule: targetMule, java: String(targetJava),
    reasonCode: null, reason: null, crossChannel, warning,
  };
}

// Does a runtime list the given Java spec (EOL or not) in its compatibleJDKs?
function runtimeSupportsJava(runtime, javaSpec) {
  return (runtime.compatibleJDKs || []).some((j) => javaSpecOf(j) === String(javaSpec));
}

// Bare Java mention (no Mule named). Not a distinct target — we always show the
// recommendation; if the named Java isn't what we'd land on (EOL 8/11, or
// unsupported), point at what we support. Returns null when nothing to flag.
function buildRequestedJavaOnly(reqMule, reqJava, highest, targetMule, targetJava, channel) {
  if (reqMule || reqJava == null || String(reqJava) === "" || String(reqJava) === String(targetJava)) {
    return null;
  }
  const supported = supportedJavas(highest);              // non-EOL Javas the rec runtime supports
  const isEol = DISCOURAGED_JAVA.includes(String(reqJava));
  // The emit() prefix already names the requested Java ("You asked for Java N."),
  // so keep the note free of that repetition — just why it's out and what we
  // recommend instead.
  const reason = isEol
    ? `That version is end-of-life.`
    : `That version isn't supported by any current Mule runtime.`;
  return {
    java: String(reqJava),
    supported: false,
    supportedJavas: supported,
    recommendedMule: String(targetMule),
    recommendedJava: String(targetJava),
    note:
      `${reason} We recommend the latest ${channel} runtime: ` +
      `Mule ${targetMule} on Java ${targetJava}` +
      (supported.length > 1 ? ` (supports Java ${supported.join(", ")})` : "") +
      `.`,
  };
}

// Non-EOL Java specs a runtime supports, sorted ascending.
function supportedJavas(runtime) {
  return (runtime.compatibleJDKs || [])
    .map((j) => javaSpecOf(j))
    .filter((s) => s && !DISCOURAGED_JAVA.includes(String(s)))
    .sort((a, b) => compareVersions(a, b));
}

// The latest Java a runtime supports that is NOT EOL/discouraged. Prefers the
// entry flagged `latest`; falls back to the highest non-discouraged spec number.
function pickLatestNonEolJava(runtime) {
  const specs = (runtime.compatibleJDKs || [])
    .map((j) => ({ jdk: j, spec: javaSpecOf(j) }))
    .filter((x) => x.spec && !DISCOURAGED_JAVA.includes(String(x.spec)));
  if (!specs.length) return null;
  const flagged = specs.find((x) => x.jdk.latest);
  if (flagged) return flagged.spec;
  return specs
    .map((x) => x.spec)
    .sort((a, b) => compareVersions(a, b))
    .pop();
}

function emit(result, outPath) {
  if (result.nothingToUpgrade) {
    log(`✅ Already on the latest ${result.channel} runtime (${result.currentMule}) and Java ${result.currentJava} — nothing to upgrade.`);
  } else if (result.needsUserPrompt) {
    log("⚠️  Could not determine an upgrade target — the agent must prompt the user.");
  } else {
    log(`Current: Mule ${result.currentMule} (${result.channel}), Java ${result.currentJava}`);
    log(`Recommended (${result.channel}, latest in channel):`);
    for (const o of result.options) {
      const label = o.kind === "java-and-mule" ? "Java + Mule" : "Mule-only";
      const patch = o.patchOnly ? " (latest patch)" : "";
      log(`  • ${label}: Mule ${o.mule}, Java ${o.java}${patch}`);
      if (o.note) log(`      ${o.note}`);
    }
  }
  const rj = result.requestedJavaOnly;
  if (rj) log(`   ⚠️  You asked for Java ${rj.java}. ${rj.note}`);
  const rt = result.requestedTarget;
  if (rt) {
    if (rt.accepted) {
      log(`Requested target: Mule ${rt.mule}, Java ${rt.java} — ACCEPTED.`);
      if (rt.crossChannel) log(`   ⚠️  ${rt.warning}`);
      if (rt.belowRecommended) log(`   ℹ️  ${rt.note}`);
    } else {
      log(`Requested target: Mule ${rt.mule}${rt.java ? `, Java ${rt.java}` : ""} — REFUSED (${rt.reasonCode}).`);
      log(`   ${rt.reason}`);
    }
  }
  for (const w of result.warnings) log(`   • ${w}`);

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    result.outPath = outPath;
    log(`Saved to ${outPath}`);
  } catch (e) {
    result.warnings.push(`Failed to write ${outPath}: ${e.message}`);
    log(`⚠️  Failed to write ${outPath}: ${e.message}`);
  }
  return result;
}

main();
