#!/usr/bin/env bash
# Runs the versionless switch validator on a Mule project or packaged app jar. Args pass through to the jar:
#   validate.sh <project-dir|app.jar> [--out <file>] [--profile strict|acb] [--include-info] [--app-id <id>] [-D<key>=<value>...]
# Exit codes: 0 switchable, 3 blockers, 1 fail closed (or no JDK), 2 usage.
set -euo pipefail

sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

# mule-versionless master CI publishes every build to this fixed SNAPSHOT (scripts/pipeline/sfci/package-validator.sh).
version=0.0.1-SNAPSHOT
dir="https://nexus-proxy.repo.local.sfdc.net/nexus/content/repositories/snapshots/org/mule/tools/versionless/versionless-validator/$version"

# Prints the path of the latest master jar; downloads it into the cache when master published a new build.
fetch_jar() {
  local cache="${XDG_CACHE_HOME:-$HOME/.cache}/mule-versionless" cfg meta part="" cred value jar url sha old
  mkdir -p "$cache"
  # Credentials go through a curl config file so they do not show in the process list.
  cfg="$(mktemp)" meta="$(mktemp)"
  trap 'rm -f "$cfg" "$meta" "$part"' RETURN
  if [[ -n "${NEXUS_USERNAME:-}" ]]; then
    # curl config values treat \ and " as special.
    cred="$NEXUS_USERNAME:${NEXUS_PASSWORD:-}"
    cred="${cred//\\/\\\\}"
    printf 'user = "%s"\n' "${cred//\"/\\\"}" >"$cfg"
  fi
  get() { curl -fsSL --config "$cfg" --netrc-optional --connect-timeout 10 --retry 2 "$@"; }

  if ! get --max-time 30 -o "$meta" "$dir/maven-metadata.xml"; then
    jar="$(ls -t "$cache"/versionless-validator-*.jar 2>/dev/null | head -1 || true)"
    if [[ -n "$jar" ]]; then
      echo "WARNING: Nexus is not reachable; using the cached $jar" >&2
      echo "$jar"
      return 0
    fi
    echo "ERROR: could not read $dir/maven-metadata.xml. On 401, set NEXUS_USERNAME and NEXUS_PASSWORD (or a" >&2
    echo "       ~/.netrc entry); otherwise check the VPN. Or set VERSIONLESS_VALIDATOR_JAR to a local jar." >&2
    return 1
  fi
  value="${version%-SNAPSHOT}-$(sed -n 's:.*<timestamp>\(.*\)</timestamp>.*:\1:p' "$meta" | head -1)-$(sed -n 's:.*<buildNumber>\(.*\)</buildNumber>.*:\1:p' "$meta" | head -1)"
  jar="$cache/versionless-validator-$value.jar"
  [[ -f "$jar" ]] && { echo "$jar"; return 0; }

  url="$dir/versionless-validator-$value.jar"
  part="$jar.part.$$"
  echo "Downloading the latest validator jar (~12 MB) from $url" >&2
  if ! get --max-time 300 -o "$part" "$url" || ! sha="$(get --max-time 30 "$url.sha256" | tr -d '[:space:]')"; then
    echo "ERROR: could not download $url" >&2
    return 1
  fi
  if [[ "$(sha256 "$part")" != "$sha" ]]; then
    echo "ERROR: $url does not match its .sha256" >&2
    return 1
  fi
  mv -f "$part" "$jar"
  for old in "$cache"/versionless-validator-*.jar; do
    [[ "$old" == "$jar" ]] || rm -f "$old"
  done
  echo "$jar"
}

java_major() {
  "$1" -version 2>&1 | awk -F'"' '/version/{print $2}' | awk -F. '{print ($1=="1")?$2:$1}' | head -1
}

# The PATH java can be a wrapper stub on some corporate machines, so try it last.
candidates=()
[[ -n "${JAVA_HOME:-}" ]] && candidates+=("$JAVA_HOME/bin/java")
if [[ -x /usr/libexec/java_home ]] && home="$(/usr/libexec/java_home -v 17+ 2>/dev/null)"; then
  candidates+=("$home/bin/java")
fi
candidates+=(
  /opt/homebrew/opt/openjdk@17/bin/java
  /usr/local/opt/openjdk@17/bin/java
  /usr/lib/jvm/java-17-openjdk/bin/java
  /usr/lib/jvm/temurin-17-jdk/bin/java
)
command -v java >/dev/null 2>&1 && candidates+=("$(command -v java)")

java_bin=""
for c in "${candidates[@]}"; do
  if [[ -x "$c" ]] && major="$(java_major "$c")" && [[ "$major" =~ ^[0-9]+$ ]] && ((major >= 17)); then
    java_bin="$c"
    break
  fi
done
if [[ -z "$java_bin" ]]; then
  echo "ERROR: no JDK 17+ found. Set JAVA_HOME to a JDK 17+ install, or install one" >&2
  echo "       (macOS: 'brew install openjdk@17'; Linux: a temurin/openjdk 17 package)." >&2
  exit 1
fi
if [[ -n "${VERSIONLESS_VALIDATOR_JAR:-}" ]]; then
  jar="$VERSIONLESS_VALIDATOR_JAR"
  [[ -f "$jar" ]] || { echo "ERROR: validator jar not found at $jar" >&2; exit 1; }
else
  jar="$(fetch_jar)" || exit 1
fi

exec "$java_bin" -jar "$jar" "$@"
