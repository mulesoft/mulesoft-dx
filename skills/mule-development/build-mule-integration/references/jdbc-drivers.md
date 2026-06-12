# JDBC Drivers — extended reference

## When to read this file

Read this file **only when** Step 6b of SKILL.md lands on one of these branches:

- Provider = `generic` (any database wired through `<db:generic-connection>` — PostgreSQL, H2, Snowflake, SAP HANA, Vertica, etc.)
- Provider = `data-source` (driver is supplied by the container, or you need to override with an explicit `<sharedLibrary>`)
- Provider = `derby` (embedded vs network client, multi-artifact)

For `my-sql`, `oracle`, and `mssql`, the four-row canonical table in SKILL.md Step 6b is authoritative — **do not load this file**; it adds noise without adding information.

## Table of contents

- [Derby — multi-artifact layout](#derby--multi-artifact-layout)
  - [Embedded mode (Java 17+)](#embedded-mode-java-17)
  - [Network client mode (Java 17+)](#network-client-mode-java-17)
  - [Legacy Derby 10.14.x for Java 8](#legacy-derby-1014x-for-java-8)
  - [Driver classes and URL shapes](#driver-classes-and-url-shapes)
- [Generic-connection drivers](#generic-connection-drivers)
  - [PostgreSQL](#postgresql)
  - [H2](#h2)
  - [Snowflake](#snowflake)
  - [SAP HANA](#sap-hana)
  - [Vertica](#vertica)
- [How to declare multiple sharedLibrary entries](#how-to-declare-multiple-sharedlibrary-entries)
- [How this content feeds Step 6b](#how-this-content-feeds-step-6b)

---

## Derby — multi-artifact layout

Apache Derby 10.15 (released 2020) split the single `derby.jar` into multiple artifacts. The split was driven by Java 9+ modularization and means a modern Derby setup declares **two or three `<sharedLibrary>` entries**, not one.

Mule 4.5/4.6/4.11 runs on **Java 17**, so the canonical version for new work is **Derby 10.16.1.1** — the 10.17 line bumps the minimum to Java 21 and is not suitable for Mule 4 today.

### Embedded mode (Java 17+)

Use when the Mule app embeds the Derby engine in-process and stores the database as local files. The URL shape is `jdbc:derby:/absolute/path;create=true`.

Declare **three** `<dependency>` blocks AND three matching `<sharedLibrary>` entries:

| groupId | artifactId | Version | Purpose |
| --- | --- | --- | --- |
| `org.apache.derby` | `derby` | `10.16.1.1` | Embedded engine |
| `org.apache.derby` | `derbyshared` | `10.16.1.1` | Shared runtime required by every Derby artifact since 10.15 |
| `org.apache.derby` | `derbytools` | `10.16.1.1` | System procedures + `ij` tooling the engine loads reflectively |

Omitting `derbyshared` produces `NoClassDefFoundError: org/apache/derby/shared/common/reference/SQLState` at first query. Omitting `derbytools` produces an opaque startup failure because the engine loads tool classes reflectively during boot.

### Network client mode (Java 17+)

Use when Mule connects to a Derby Network Server running in a separate process. The URL shape is `jdbc:derby://host:1527/dbname`. Mule is the client; the server is deployed and managed outside the Mule app.

Declare **two** `<dependency>` + `<sharedLibrary>` pairs:

| groupId | artifactId | Version | Purpose |
| --- | --- | --- | --- |
| `org.apache.derby` | `derbyclient` | `10.16.1.1` | Network client driver |
| `org.apache.derby` | `derbyshared` | `10.16.1.1` | Shared runtime |

No `derby` or `derbytools` — the engine lives on the server side.

### Legacy Derby 10.14.x for Java 8

If the deployment target is a legacy Mule runtime on Java 8, the multi-artifact split does not apply. Use Derby **10.14.2.0** (single `derby.jar` for embedded, single `derbyclient.jar` for network):

| Mode | groupId | artifactId | Version |
| --- | --- | --- | --- |
| Embedded | `org.apache.derby` | `derby` | `10.14.2.0` |
| Network client | `org.apache.derby` | `derbyclient` | `10.14.2.0` |

This branch is almost never correct on Mule 4.5+ (which ships Java 17); use it only when you have an explicit Java 8 constraint.

### Driver classes and URL shapes

| Mode | Driver class | URL shape |
| --- | --- | --- |
| Embedded | `org.apache.derby.jdbc.EmbeddedDriver` | `jdbc:derby:/path/to/db;create=true` |
| Network client | `org.apache.derby.jdbc.ClientDriver` | `jdbc:derby://host:1527/dbname` |

The Step-5 XML shape for both modes is `<db:generic-connection>` with `driverClassName` set explicitly — `mule-db-connector` does not ship a `<db:derby-connection>` element in the 1.15 line.

```xml
<db:config name="derbyConfig">
    <db:generic-connection
        url="${db.url}"
        driverClassName="org.apache.derby.jdbc.EmbeddedDriver"/>
</db:config>
```

---

## Generic-connection drivers

When Step 6 picks `generic`, the XML shape is always `<db:generic-connection url="..." driverClassName="..."/>` — the actual database is identified by the URL and driver class, not by a Mule-level provider. Step 6b's prompt surfaces the databases below as canonical options.

### PostgreSQL

This is the most common `generic` target. Versions verified against Maven Central.

| groupId | artifactId | Version | Driver class |
| --- | --- | --- | --- |
| `org.postgresql` | `postgresql` | `42.7.11` | `org.postgresql.Driver` |

URL shape: `jdbc:postgresql://host:5432/dbname`. Single-artifact declaration.

### H2

Common for embedded/testing scenarios.

| groupId | artifactId | Version | Driver class |
| --- | --- | --- | --- |
| `com.h2database` | `h2` | `2.3.232` | `org.h2.Driver` |

URL shape: `jdbc:h2:file:/path/to/db` (file), `jdbc:h2:mem:name` (in-memory), `jdbc:h2:tcp://host:port/db` (server).

### Snowflake

| groupId | artifactId | Version | Driver class |
| --- | --- | --- | --- |
| `net.snowflake` | `snowflake-jdbc` | `3.20.0` | `net.snowflake.client.jdbc.SnowflakeDriver` |

URL shape: `jdbc:snowflake://<account>.snowflakecomputing.com/?warehouse=...&db=...`.

### SAP HANA

| groupId | artifactId | Version | Driver class |
| --- | --- | --- | --- |
| `com.sap.cloud.db.jdbc` | `ngdbc` | `2.22.8` | `com.sap.db.jdbc.Driver` |

URL shape: `jdbc:sap://host:port/?databaseName=...`.

### Vertica

| groupId | artifactId | Version | Driver class |
| --- | --- | --- | --- |
| `com.vertica.jdbc` | `vertica-jdbc` | `24.3.0-0` | `com.vertica.jdbc.Driver` |

URL shape: `jdbc:vertica://host:5433/dbname`.

---

## How to declare multiple sharedLibrary entries

When the sidecar `tmp/connector-choices/db-driver.json` has multiple entries (Derby embedded, for example), Step 8 must emit one `<dependency>` block AND one `<sharedLibrary>` block **per entry**. The groupId and artifactId on the `<sharedLibrary>` side must match the `<dependency>` side character-for-character.

```xml
<!-- inside <dependencies> -->
<dependency>
    <groupId>org.apache.derby</groupId>
    <artifactId>derby</artifactId>
    <version>10.16.1.1</version>
</dependency>
<dependency>
    <groupId>org.apache.derby</groupId>
    <artifactId>derbyshared</artifactId>
    <version>10.16.1.1</version>
</dependency>
<dependency>
    <groupId>org.apache.derby</groupId>
    <artifactId>derbytools</artifactId>
    <version>10.16.1.1</version>
</dependency>

<!-- inside <build><plugins><plugin>mule-maven-plugin</plugin><configuration> -->
<sharedLibraries>
    <sharedLibrary>
        <groupId>org.apache.derby</groupId>
        <artifactId>derby</artifactId>
    </sharedLibrary>
    <sharedLibrary>
        <groupId>org.apache.derby</groupId>
        <artifactId>derbyshared</artifactId>
    </sharedLibrary>
    <sharedLibrary>
        <groupId>org.apache.derby</groupId>
        <artifactId>derbytools</artifactId>
    </sharedLibrary>
</sharedLibraries>
```

A single missing entry on either side surfaces at build time as `The mule application does not contain the following shared libraries: [<artifactId>:<groupId>]` or at runtime as `NoClassDefFoundError`.

---

## How this content feeds Step 6b

When Step 6b branches into `generic`, `data-source`, or `derby`, it prompts the user with the canonical options from this file. The outcome is one or more `{groupId, artifactId, version}` tuples written to `tmp/connector-choices/db-driver.json`, plus the driver class. The sidecar schema is:

```json
{
  "dependencies": [
    { "groupId": "org.apache.derby", "artifactId": "derby",        "version": "10.16.1.1" },
    { "groupId": "org.apache.derby", "artifactId": "derbyshared",  "version": "10.16.1.1" },
    { "groupId": "org.apache.derby", "artifactId": "derbytools",   "version": "10.16.1.1" }
  ],
  "driverClass": "org.apache.derby.jdbc.EmbeddedDriver"
}
```

Step 7's TDD renders every entry in that array under "Build-time additions". Step 9 applies every entry mechanically to `pom.xml`. Neither step prompts — the design decision is fully resolved here.
