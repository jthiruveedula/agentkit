# Decision frameworks — multi-cloud + open-source data stack

Four axes come up on almost every data platform decision. Walk through
them explicitly rather than defaulting to whatever's familiar — the ADR
records which axis actually drove the call.

## 1. Storage layer

| Option | Pick when | Watch out for |
|---|---|---|
| BigQuery (GCP) | Team on GCP, need serverless scale, BI-tool heavy | Cost on full-table scans without partitioning |
| Redshift (AWS) | Team on AWS, need tight VPC integration | Cluster sizing/vacuum maintenance overhead |
| Snowflake | Multi-cloud portability matters more than lock-in avoidance | Compute credits add up fast on idle warehouses |
| Synapse (Azure) | Team on Azure, need Power BI-native integration | Smaller ecosystem than BQ/Snowflake for 3rd-party tools |
| Databricks + Delta Lake | Need unified batch+streaming, ML on the same data, open table format | Two skillsets (SQL analysts + Spark engineers) on one platform |
| Iceberg/Delta on S3/GCS (lakehouse, no vendor warehouse) | Want to avoid warehouse compute lock-in, query with multiple engines (Trino, Spark, DuckDB) | More ops burden — you own compaction, catalog, access control |
| DuckDB | Local/embedded analytics, small-to-medium data, no server to run | Not a multi-user production warehouse |

## 2. Compute / processing engine

| Option | Pick when | Watch out for |
|---|---|---|
| dbt (+ warehouse compute) | Transform logic is mostly SQL, want tests/docs/lineage built in | Not for row-by-row or non-SQL-shaped transforms |
| Spark (Databricks, EMR, Dataproc) | Large-scale, complex transforms, ML feature engineering | Cluster startup latency; overkill for small data |
| dbt + Trino/Presto | Query across multiple storage systems without moving data | Federation adds latency vs. native warehouse compute |
| Pandas/Polars in a script or Lambda | Small data, simple transform, no cluster needed | Doesn't scale past single-machine memory |

## 3. Orchestration

| Option | Pick when | Watch out for |
|---|---|---|
| Airflow | Complex DAGs, large open-source community, need custom operators | Scheduler/metadata-DB ops burden if self-hosted |
| Dagster | Want asset-based (not just task-based) lineage, strong local dev loop | Smaller ecosystem of pre-built integrations than Airflow |
| Cloud-native (Cloud Composer / MWAA / Azure Data Factory) | Want managed Airflow/orchestration without running the scheduler yourself | Priced per environment, not just per job |
| dbt Cloud / GitHub Actions cron | Orchestration need is just "run dbt on a schedule" | Not a general-purpose DAG scheduler |

## 4. Batch vs. streaming

- **Batch** — default. Cheaper, simpler, easier to debug and backfill.
  Pick unless a real requirement needs sub-minute freshness.
- **Streaming** (Kafka, Kinesis, Pub/Sub, Spark Structured Streaming) —
  only when the *business* requirement needs it (fraud detection, live
  dashboards with second-level freshness), not because streaming sounds
  more sophisticated. Streaming triples the operational surface: exactly-
  once semantics, schema evolution mid-stream, backpressure, replay.
- **Micro-batch** (5–15 min batch cycles) often gets 90% of the perceived
  "real-time" benefit at a fraction of streaming's operational cost —
  consider it before committing to true streaming.

## Medallion / layered architecture (the default shape)

Unless the brief says otherwise, structure the warehouse/lakehouse in
layers:

- **Bronze/raw** — landed exactly as extracted, append-only, no
  transforms. Source of truth for replay/backfill.
- **Silver/clean** — deduplicated, typed, conformed to a schema, business
  keys resolved. Still one row per source-system record.
- **Gold/mart** — aggregated, denormalized for a specific consumption
  pattern (a dashboard, an ML feature set, a reverse-ETL sync).

Each layer is a separate dbt model layer or separate storage
path/dataset, not just a naming convention inside one flat schema —
that's what makes backfills and lineage tractable.

## Cost/performance axes to name explicitly in an ADR

1. **Storage cost** vs. **compute cost** — are you optimizing for cheap
   storage + pay-per-query, or provisioned compute that's cheaper at
   sustained high volume?
2. **Freshness requirement** — actual business need, in minutes/hours,
   not "as fresh as possible."
3. **Query latency requirement** — dashboard (sub-second) vs. batch
   report (minutes are fine) vs. ML training (throughput matters more
   than latency).
4. **Operational ownership** — who runs/monitors this in 6 months? A
   self-hosted Airflow cluster is a different commitment than a managed
   service.
5. **Portability requirement** — is avoiding vendor lock-in a real
   constraint (regulatory, multi-cloud contract) or a nice-to-have that's
   not worth the added complexity of an abstraction layer?

## Open-source stack quick reference

| Need | Reach for |
|---|---|
| SQL transforms + tests + docs + lineage | dbt |
| DAG orchestration | Airflow or Dagster |
| Distributed processing | Spark |
| Streaming ingestion | Kafka (or cloud-native: Kinesis/Pub/Sub) |
| Open table format on object storage | Apache Iceberg or Delta Lake |
| Federated/interactive SQL across sources | Trino |
| Local/embedded analytics | DuckDB |
| Infra as code | Terraform |
| Data quality / contracts | dbt tests, Great Expectations, or Soda |
