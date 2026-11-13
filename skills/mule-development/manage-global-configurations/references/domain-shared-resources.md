# Domain Shared Resources (Domain Mode)

Rules for managing global configurations in a **Mule domain project**. The domain owns the shared resources, and every application linked to it (through a pom dependency with `<classifier>mule-domain</classifier>`) can reference them by name.

## Detecting Domain Mode

The target project is a domain when its `pom.xml` contains `<packaging>mule-domain</packaging>`. This is the same check Anypoint Code Builder makes. As a fallback, an unpackaged project with a `src/main/domain` folder is also a domain. Everything below applies only in domain mode; application projects keep the default conventions.

## What Changes vs. an Application

| Concern | Application | Domain |
| --- | --- | --- |
| Config file | `src/main/mule/global-configs.xml` | `src/main/mule/mule-domain-config.xml` |
| XML root | `<mule xmlns="http://www.mulesoft.org/schema/mule/core">` | `<domain:mule-domain>` (core is the default namespace, `xmlns:domain="http://www.mulesoft.org/schema/mule/ee/domain"`) |
| Properties file | `src/main/resources/config.yaml` | `src/main/resources/domain.properties` (registered with `<configuration-properties file="domain.properties"/>`) |
| Dependencies | App `pom.xml` | **Domain** `pom.xml`. Linked apps get the connector as `provided` when they are (re)linked. |
| Flows, sub-flows | Allowed | **Never.** A domain holds only global elements. |
| After a change | `mvn clean package` | `mvn clean install -DskipTests`, so `~/.m2` holds the new domain jar for linked apps and run configurations |

Add the namespace and schema location of every element to the `<domain:mule-domain>` root, exactly as in an app. Keep the `domain` namespace and its schema location (`http://www.mulesoft.org/schema/mule/ee/domain/current/mule-domain-ee.xsd`).

## Shareable Resources

Anypoint Code Builder imposes no allow-list; any global element written in the domain becomes visible to linked apps. The resources that are commonly shared, and that work reliably, are:

| Resource | Element | Notes |
| --- | --- | --- |
| HTTP/HTTPS listener | `http:listener-config` | The main reason domains exist: many apps share one port. Each app's `http:listener` must use a **distinct `path`**. |
| HTTP request | `http:request-config` | Shared outbound base URL and auth. |
| TLS context | `tls:context` | Keystore and truststore files go in the domain's `src/main/resources`. |
| Database | `db:config` | Shared connection pool. Add the JDBC driver as a domain dependency **and** to `mule-maven-plugin` `<sharedLibraries>`. |
| JMS / ActiveMQ / IBM MQ | `jms:config`, `ibm-mq:config` | Shared broker connection. Add the client jar to `<sharedLibraries>`. |
| VM | `vm:config` | Queues shared between apps in the domain (cross-app messaging). |
| Object Store | `os:object-store` / `os:config` | Persistent stores shared between apps. |
| Properties | `configuration-properties`, `global-property`, `secure-properties:config` | Visible only to domain elements. Apps do **not** inherit domain properties. |

Do **not** put these in a domain: flows, sub-flows, `error-handler` used by flows, `configuration` (`defaultErrorHandler-ref`), API AutoDiscovery, or `ee:cache` strategies that refer to flows. These elements belong to individual applications.

## Placeholders

- Use `${key}` for every environment-specific value, and add `key=value` to `domain.properties`.
- Use domain-specific key prefixes (`http.shared.port`, `db.shared.host`) so they don't collide with the apps' own keys.
- For secrets, use `secure-properties:config` with `${secure::key}`. The decryption key comes from a system property (`-Dsecure.key=…`) on the runtime that hosts the domain.
- `${domain}` resolves to the domain name only inside a domain. Avoid it in elements that might later be inlined into an app during an unlink.

## Applications Linked to a Domain

When the target is an application linked to a domain, check the domain's shared elements before creating a config. If the domain already provides an equivalent config (same type and purpose, for example an HTTP listener on the same port), propose referencing it by name instead of creating a duplicate. A local config with the same name **shadows** the domain's. A listener on the same port fails at deploy.

## Before Editing or Deleting a Shared Resource

Shared resources are a cross-project contract. Before any **EDIT** that renames an element or changes its type, and before any **DELETE**:

1. Find the linked applications (`<link-mule-domain-dir>` is the sibling `link-mule-domain` folder next to this skill's directory):
   ```bash
   node <link-mule-domain-dir>/scripts/scan_workspace.mjs <workspace-root>
   ```
   Check `domains[].linkedApplications` for this domain.
2. Run FIND USAGES (the same reference patterns as for an app) across **every linked app's** `src/main/mule/**/*.xml` as well as the domain.
3. Present the usages grouped by application, and confirm with the user. **STOP.**
4. For a rename: update the element and every `config-ref` / `tlsContext` / … in the linked apps in the same change.
   For a delete with remaining usages: offer either to keep the element, or to move it into the apps that use it (using skill link-mule-domain unlink for full detachment, or copying the element into each app's `global-configs.xml`).
5. After the change, run `mvn clean install -DskipTests` in the domain, then `mvn clean package -DskipTests` in each linked app.

Edits that change only values (a port, a host, a pool size) need no app changes. They still require reinstalling the domain.

## Validation in Domain Mode

- **LIST ALL**: list the top-level elements of `<domain:mule-domain>`. For each, report the usage count across the linked apps (0 = unused shared resource).
- **VALIDATE**: in the domain itself, check intra-domain references (e.g. `tlsContext` on a listener). Then, for each linked app, check that its references resolve to either the app or the domain. Use `node <link-mule-domain-dir>/scripts/link_domain.mjs <app> <domain> --dry-run`, whose `references.dangling` / `references.shadowed` fields report this.
- Flag any listener port that is configured both in the domain and in an app: deploying both fails with "port already in use".

## Troubleshooting

- **Linked app can't find a shared config after a domain change:** Reinstall the domain (`mvn clean install -DskipTests` in the domain project) and rebuild the app.
- **Port already in use at deploy:** An app declares its own listener on the domain listener's port. Make the app reference the domain's listener instead.
