# Nightly jobs: cron to Dagster

We ran 41 nightly jobs from one crontab on etl-02 for about four years. It mostly worked. The trouble was the nights it didn't, because cron has no idea that the 02:15 export needs the 01:30 load to finish first.

```
30 1 * * * /opt/etl/load_orders.sh >> /var/log/etl/load.log 2>&1
```

That line failed silently eleven times last quarter. Each time I heard about it from a finance analyst around 9am, which is a bad way to find out.

I moved 34 of the 41 jobs to Dagster over three weeks. The remaining seven are shell scripts nobody will admit to owning, so they stay on cron until someone does. Retries are set to two with a five minute wait. Since the cutover on March 4 we have had three failures. The orchestrator paged me for each of them before 3am.

My one gripe is the UI. Run history takes around eight seconds to load and I open that page maybe twenty times a day. Slow, but I can see what broke.

Still cheaper than the old mornings.
