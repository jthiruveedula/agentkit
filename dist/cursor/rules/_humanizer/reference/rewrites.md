# Rewrite examples

Each pair keeps every fact, number, name and technical term; where the before is vague, the after says less instead of inventing detail.

## Blog paragraph

**Before**

> In today's fast-paced data landscape, teams are constantly seeking robust solutions. When we migrated our 12 Airflow DAGs to Dagster in Q2, it wasn't just an upgrade — it was a transformation. Our nightly run time dropped from 95 minutes to 40, and it's worth noting that on-call pages fell from 9 a month to 2. Ultimately, this journey empowered our team to move faster, build smarter, and sleep better.

**After**

> We moved our 12 Airflow DAGs to Dagster in Q2. The nightly run used to take 95 minutes. Now it takes 40. On-call pages fell from 9 a month to 2, and we sleep better for it.

## README section

**Before**

> **Overview**
>
> Welcome to **pgsnap** — a powerful, seamless, and comprehensive tool for PostgreSQL backups! pgsnap leverages `pg_dump` under the hood to streamline your backup journey. Getting started is easy: simply run `pgsnap init` in order to create a config file, then `pgsnap run` to take your first snapshot. Snapshots are stored in S3, and it's worth noting that they are retained for 30 days by default. Feel free to open an issue if you have any questions!

**After**

> **Usage**
>
> pgsnap backs up PostgreSQL with `pg_dump` and stores the snapshots in S3.
>
> `pgsnap init` creates a config file. `pgsnap run` takes a snapshot. Snapshots are kept for 30 days by default. If something is unclear, open an issue.

## Slide

**Before**

```
🚀 Unlocking the Future of Our Data Platform
- ✨ Leveraging a robust, scalable, and modern architecture
- 📈 Query costs reduced by 38% since the January migration to Iceberg
- ⚡ Dashboards are now truly faster — p95 load time went from 11s to 4s
- 🤝 Empowering teams across the organization
- 🔮 Exciting things ahead!
```

**After**

```
Query costs are down 38% since the January move to Iceberg
- Query costs: down 38% since the migration
- Dashboard p95 load time: 11s to 4s
```

## Status email

**Before**

> Hi team,
>
> I hope this email finds you well! I wanted to reach out with a quick update on the billing export project. We've made tremendous progress — 14 of the 18 reports are now migrated, tested, and validated. That said, it's important to note that the remaining 4 are blocked on a schema change from the payments team, which may potentially impact our March 21 deadline. Rest assured, we are working diligently to resolve this. Please don't hesitate to let me know if you have any questions!
>
> Best,
> Priya

**After**

> Hi team,
>
> Billing export update. 14 of the 18 reports are migrated and have passed testing and validation. The other 4 are blocked. They need a schema change from the payments team, and that may push us past the March 21 deadline. We are working on it. Questions to me.
>
> Priya
