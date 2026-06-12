# Common Mule Connectors Catalog

Quick reference for frequently used Mule 4 connectors.

> **Status: discovery aid only, not a build-time source of truth.**
>
> The asset IDs and use cases below are maintained to help identify which
> connector exists for which integration need. **The version numbers are a
> best-effort snapshot that can drift**, so never paste a version from this
> file into `dx project create --dependencies` or a `pom.xml` dependency
> block directly.
>
> At build time the version **must** come from `get_latest_connector.sh`
> (defined in SKILL.md Step 3), which queries Anypoint Exchange live. If
> the helper returns a different version than what is listed here, the
> helper wins. See the enforcement rule in SKILL.md Step 3.
>
> Versions below last verified against live Exchange on **2026-04-24**.

---

## Core Connectors

### HTTP Connector
**Asset:** `org.mule.connectors:mule-http-connector` (snapshot: `1.11.1`)
**Use for:**
- HTTP listeners (REST API endpoints)
- HTTP requests (calling external APIs)
- Basic authentication, OAuth2
- HTTPS/TLS

**Common operations:**
- `http:listener` - Receive HTTP requests
- `http:request` - Make HTTP requests

---

### Database Connector
**Asset:** `org.mule.connectors:mule-db-connector` (snapshot: `1.15.1`)
**Use for:**
- MySQL, PostgreSQL, Oracle, SQL Server connections
- SQL queries (SELECT, INSERT, UPDATE, DELETE)
- Stored procedures
- Batch operations

**Database-specific notes:**
- **MySQL:** Use `<db:my-sql-connection>` (built-in)
- **PostgreSQL:** Use `<db:generic-connection>` + add JDBC driver dependency:
  ```xml
  <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <version>42.5.1</version>
  </dependency>
  ```
- **Oracle:** Requires Oracle JDBC driver
- **SQL Server:** Requires Microsoft JDBC driver

**Common operations:**
- `db:select` - Query data
- `db:insert` - Insert records
- `db:update` - Update records
- `db:delete` - Delete records

---

## Salesforce Connectors

### Salesforce Connector
**Asset:** `com.mulesoft.connectors:mule-salesforce-connector` (snapshot: `11.4.0`)
**Use for:**
- Standard SOAP/REST API access
- SOQL queries
- CRUD operations (Create, Read, Update, Delete)
- Bulk API
- Metadata API

**Authentication types:**
- Basic (username + password + security token)
- OAuth 2.0
- JWT Bearer Token

**Common operations:**
- `salesforce:query` - SOQL queries
- `salesforce:create` - Create records
- `salesforce:update` - Update records
- `salesforce:delete` - Delete records
- `salesforce:upsert` - Insert or update

**Example SOQL:**
```sql
SELECT Id, Name, Amount, CloseDate
FROM Opportunity
WHERE CloseDate >= THIS_YEAR
AND Amount > 0
LIMIT 100
```

---

### Salesforce Pub/Sub API Connector
**Asset:** `com.mulesoft.connectors:mule4-salesforce-pubsub-connector` (snapshot: `1.2.0`)
**Use for:**
- Event-driven integrations
- Platform Events
- Change Data Capture
- Real-time data streaming

---

## NetSuite Connectors

### NetSuite Connector
**Asset:** `com.mulesoft.connectors:mule-netsuite-connector` (snapshot: `11.11.2`)
**Use for:**
- ERP operations (Sales Orders, Customers, Items)
- SuiteTalk SOAP API
- RESTlet calls
- Saved searches

**Authentication types:**
- Request-based (email + password)
- Token-based (OAuth 1.0a)

**⚠️ Important Notes:**
- Syntax varies by connector version
- Use `skills/netsuite-integration-helper` for version-specific guidance
- Consider NetSuite RESTlet for simpler REST-based access

**Common operations:**
- `netsuite:add` - Create records
- `netsuite:update` - Update records
- `netsuite:upsert` - Insert or update
- `netsuite:search` - Query records
- `netsuite:get` - Retrieve by ID

---

### NetSuite Restlet Connector
**Asset:** `com.mulesoft.connectors:mule4-netsuite-restlet-connector` (snapshot: `1.0.9`)
**Use for:**
- REST-based NetSuite access
- Custom RESTlet scripts
- Simpler API interactions

---

## File & FTP Connectors

### File Connector
**Asset:** `org.mule.connectors:mule-file-connector` (snapshot: `1.5.5`)
**Use for:**
- Local file system operations
- Read/write/move/delete files
- File polling
- Directory monitoring

---

### FTP Connector
**Asset:** `org.mule.connectors:mule-ftp-connector` (snapshot: `2.0.3`)
**Use for:**
- FTP/FTPS operations
- Remote file transfers
- Secure file uploads/downloads

---

### SFTP Connector
**Asset:** `org.mule.connectors:mule-sftp-connector` (snapshot: `2.7.0`)
**Use for:**
- Secure FTP over SSH
- Key-based authentication
- Enterprise file transfers

---

## Messaging Connectors

### Anypoint MQ Connector
**Asset:** `com.mulesoft.connectors:anypoint-mq-connector` (snapshot: `4.0.14`)
**Use for:**
- MuleSoft-hosted message queues (preferred for MuleSoft-first integrations)
- Publish / subscribe between Mule applications
- External queueing without standing up JMS infrastructure

**Common operations:**
- `anypoint-mq:publish` - Send a message to a queue or exchange
- `anypoint-mq:subscriber` (source) - Consume messages

---

### JMS Connector
**Asset:** `org.mule.connectors:mule-jms-connector` (snapshot: `1.10.3`)
**Use for:**
- ActiveMQ, IBM MQ, Amazon SQS (via JMS)
- Message queues
- Publish/subscribe patterns
- Asynchronous messaging

---

### Kafka Connector
**Asset:** `com.mulesoft.connectors:mule-kafka-connector` (snapshot: `4.13.0`)
**Use for:**
- Apache Kafka integration
- Event streaming
- Real-time data pipelines
- Microservices communication

---

### AMQP Connector
**Asset:** `com.mulesoft.connectors:mule-amqp-connector` (snapshot: `1.9.0`)
**Use for:**
- RabbitMQ
- AMQP protocol messaging
- Queue-based integrations

---

### IBM MQ Connector
**Asset:** `com.mulesoft.connectors:mule-ibm-mq-connector` (snapshot: `1.8.2`)
**Use for:**
- IBM MQ–specific integrations when JMS is not preferred
- Native IBM MQ features

---

### VM Connector (in-Mule transport)
**Asset:** `org.mule.connectors:mule-vm-connector` (snapshot: `2.0.1`)
**Use for:**
- Queueing **between flows inside the same Mule app** (not external)
- Lightweight in-memory or persistent JVM-local queues

**Do NOT use for external queueing or cross-app messaging** — use Anypoint MQ, JMS, Kafka, or AMQP instead. VM is a transport, not a broker.

---

## Cloud Connectors

### AWS Connectors

**S3 Connector**
- **Asset:** `com.mulesoft.connectors:mule-amazon-s3-connector` (snapshot: `8.0.2`)
- **Use for:** S3 bucket operations, file storage

**SQS Connector**
- **Asset:** `com.mulesoft.connectors:mule-amazon-sqs-connector` (snapshot: `5.12.5`)
- **Use for:** AWS message queues

**DynamoDB Connector**
- **Asset:** `com.mulesoft.connectors:mule-amazon-dynamodb-connector` (snapshot: `1.6.3`)
- **Use for:** NoSQL database operations, DynamoDB Streams

---

### Azure Connectors

**Azure Service Bus**
- **Asset:** `com.mulesoft.connectors:mule-azure-service-bus-connector` (snapshot: `3.6.1`)
- **Use for:** Azure messaging (queues, topics, subscriptions)

**Azure Data Lake Storage**
- **Asset:** `com.mulesoft.connectors:mule-azure-data-lake-storage-connector` (snapshot: `1.0.8`)
- **Use for:** Azure ADLS Gen2 blob/file storage

**Azure Storage (Blob / Queue / Table)**
- **Asset:** `org.mule.modules:azure-storage-connector` (snapshot: `3.1.1`)
- **Use for:** Standard Azure Storage services — Blob Storage, Queue Storage, Table Storage. Note the non-canonical `org.mule.modules` groupId.

---

### Google Connectors

**Google Drive**
- **Asset:** `com.mulesoft.connectors:mule4-google-drive-connector` (snapshot: `1.1.4`)
- **Use for:** File storage and sharing

**Google Sheets**
- **Asset:** `com.mulesoft.connectors:mule4-google-sheets-connector` (snapshot: `1.1.15`)
- **Use for:** Read/write Google Sheets rows and ranges, spreadsheet automation

---

## API Integration Connectors

### REST Connector
**Built-in via HTTP Connector**
Use `http:request` for RESTful API calls

---

### SOAP Connector
**Asset:** `org.mule.connectors:mule-wsc-connector` (snapshot: `2.1.2`)
**Use for:**
- SOAP web services
- WSDL-based integrations
- Legacy systems

---

### GraphQL (APIKit for GraphQL)
**Asset:** `org.mule.modules:mule-graphql-module` (snapshot: `1.2.0`)
**Use for:**
- Exposing a GraphQL endpoint from a Mule app via APIKit for GraphQL
- Schema-first GraphQL runtime extension

> For **consuming** an external GraphQL API, there is no dedicated client connector — use the HTTP Connector with POST requests.

---

## Other Systems

### ServiceNow Connector
**Asset:** `com.mulesoft.connectors:mule-servicenow-connector` (snapshot: `6.18.2`)
**Use for:** ITSM operations, incident management

---

### Workday Connector
**Asset:** `com.mulesoft.connectors:mule-workday-connector` (snapshot: `16.7.0`)
**Use for:** HR/Finance integrations

---

### SAP Connector
**Asset:** `com.mulesoft.connectors:mule-sap-connector` (snapshot: `5.9.13`)
**Use for:** SAP ERP integrations

---

### MongoDB Connector
**Asset:** `com.mulesoft.connectors:mule-mongodb-connector` (snapshot: `6.3.12`)
**Use for:** NoSQL database operations

---

### Slack Connector
**Asset:** `org.mule.connectors:mule-slack-connector` (snapshot: `4.3.2`)
**Use for:** Slack messaging, notifications

---

## Connector Selection Guide

### For HTTP APIs
1. **Known system (Salesforce, NetSuite, etc.):** Use specific connector
2. **Generic REST API:** Use HTTP Connector
3. **SOAP API:** Use SOAP (WSC) Connector
4. **GraphQL API:** Use HTTP Connector with POST requests

### For Databases
1. **MySQL:** Database Connector (built-in support)
2. **PostgreSQL:** Database Connector + JDBC driver
3. **Oracle:** Database Connector + JDBC driver
4. **NoSQL (MongoDB, DynamoDB):** Specific NoSQL connectors

### For File Operations
1. **Local files:** File Connector
2. **FTP/FTPS:** FTP Connector
3. **SFTP:** SFTP Connector
4. **Cloud storage (S3, Azure):** Cloud-specific connectors

### For Messaging (external / cross-app)
1. **MuleSoft-hosted queues:** Anypoint MQ Connector
2. **JMS-compatible (ActiveMQ, IBM MQ via JMS):** JMS Connector
3. **Native IBM MQ:** IBM MQ Connector
4. **Kafka:** Kafka Connector
5. **RabbitMQ:** AMQP Connector
6. **AWS SQS:** Amazon SQS Connector
7. **Azure Service Bus:** Azure Service Bus Connector

**Do not use VM for external queueing.** VM is the in-Mule transport (same-JVM) — pick one of the options above when the prompt says "queue", "publish", "messaging", "durable", or names an external broker.

---

## Finding Connectors at Build Time

Use the `get_latest_connector.sh` helper defined in SKILL.md Step 3. It calls
Anypoint Exchange live and returns the authoritative groupId, assetId, and
version for the supplied search term:

```bash
get_latest_connector.sh "mule-amazon-s3-connector"
# -> com.mulesoft.connectors:mule-amazon-s3-connector:8.0.2  (as of query time)
```

**Always use the helper's output for the version number** when writing
`dx project create --dependencies` or pom.xml dependency blocks. The
snapshot versions in this file are discovery hints, not authoritative.

### Common searches:
- `salesforce` - Salesforce connectors
- `database` - Database connector
- `http` - HTTP connector
- `file` - File operations
- `sap` - SAP connectors
- `mongodb` - MongoDB connector
- `anypoint-mq` - Anypoint MQ
- `kafka` - Kafka
- `s3` or `amazon-s3` - Amazon S3

### Filter criteria:
- **Runtime:** Look for `4.x` (Mule 4)
- **GroupId:** Prefer `com.mulesoft.connectors` or `org.mule.connectors`
- **Version:** Latest stable — always take the version the helper returns

---

## References

- **Anypoint Exchange:** https://www.mulesoft.com/exchange/
- **Connector Documentation:** https://docs.mulesoft.com/connectors/
- **Mule 4 Migration:** https://docs.mulesoft.com/mule-runtime/latest/migration-connectors

---

## Tips

1. **Always include HTTP Connector** for manual trigger endpoints
2. **Include Scheduler** (built-in) for periodic jobs
3. **Check database-specific requirements** (JDBC drivers)
4. **Verify connector compatibility** with the target Mule runtime version (Mule 4.4.x / 4.5.x / 4.8.x differ in required connector ranges)
5. **Always take versions from `get_latest_connector.sh`** — do not paste versions from this catalog or from training-time memory
6. **Read connector documentation** for authentication setup
7. **Test connectors individually** before complex integrations
