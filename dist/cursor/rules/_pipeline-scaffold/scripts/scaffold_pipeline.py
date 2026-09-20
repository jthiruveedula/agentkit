#!/usr/bin/env python3
"""Scaffold a new data pipeline unit -- a dbt model, an Airflow DAG, a
Dagster asset, or a PySpark job -- following medallion (bronze/silver/gold)
naming and with a test stub included. Deterministic boilerplate so the
agent (or you) fills in the actual transform logic, not the ceremony.

    python3 scaffold_pipeline.py --kind dbt --layer silver --name orders
    python3 scaffold_pipeline.py --kind airflow --name daily_extract
    python3 scaffold_pipeline.py --kind dagster --layer gold --name revenue_mart
    python3 scaffold_pipeline.py --kind spark --name event_dedup
"""
import argparse
import sys
from pathlib import Path

LAYERS = ("bronze", "silver", "gold")


def write(path, content, force):
    if path.exists() and not force:
        print("skip (exists, pass --force to overwrite): %s" % path, file=sys.stderr)
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print("wrote %s" % path)
    return True


def scaffold_dbt(name, layer, out, force):
    layer = layer or "silver"
    model_dir = out / "models" / layer
    sql = (
        "-- %s.%s -- TODO: describe what this model produces, one line\n"
        "with source as (\n"
        "    select * from {{ ref('CHANGE_ME_upstream_model') }}\n"
        "),\n\n"
        "final as (\n"
        "    select\n"
        "        -- TODO: select + rename/cast columns here\n"
        "        *\n"
        "    from source\n"
        ")\n\n"
        "select * from final\n" % (layer, name)
    )
    yml = (
        "version: 2\n\n"
        "models:\n"
        "  - name: %s\n"
        "    description: \"TODO: one-line description\"\n"
        "    columns:\n"
        "      - name: CHANGE_ME_primary_key\n"
        "        description: \"TODO\"\n"
        "        tests:\n"
        "          - unique\n"
        "          - not_null\n" % name
    )
    write(model_dir / f"{name}.sql", sql, force)
    write(model_dir / f"{name}.yml", yml, force)


def scaffold_airflow(name, out, force):
    py = (
        '"""%s -- TODO: describe what this DAG does."""\n'
        "from datetime import datetime, timedelta\n\n"
        "from airflow import DAG\n"
        "from airflow.operators.python import PythonOperator\n\n"
        "default_args = {\n"
        '    "owner": "data-platform",\n'
        '    "retries": 2,\n'
        '    "retry_delay": timedelta(minutes=5),\n'
        "}\n\n"
        "with DAG(\n"
        '    dag_id="%s",\n'
        "    default_args=default_args,\n"
        '    schedule="@daily",\n'
        "    start_date=datetime(2026, 1, 1),\n"
        "    catchup=False,\n"
        '    tags=["TODO"],\n'
        ") as dag:\n\n"
        "    def run():\n"
        "        # TODO: implement\n"
        "        raise NotImplementedError\n\n"
        "    task = PythonOperator(task_id=\"%s\", python_callable=run)\n" % (name, name, name)
    )
    write(out / "dags" / f"{name}_dag.py", py, force)


def scaffold_dagster(name, layer, out, force):
    layer = layer or "silver"
    py = (
        '"""%s -- TODO: describe what this asset produces. Layer: %s."""\n'
        "from dagster import asset, AssetExecutionContext\n\n\n"
        '@asset(group_name="%s")\n'
        "def %s(context: AssetExecutionContext):\n"
        "    # TODO: implement -- read upstream asset(s), transform, return\n"
        "    raise NotImplementedError\n" % (name, layer, layer, name)
    )
    write(out / "assets" / f"{name}_asset.py", py, force)


def scaffold_spark(name, out, force):
    py = (
        '"""%s -- TODO: describe what this job does.\n\n'
        "Usage: spark-submit %s_job.py --input <path> --output <path>\n"
        '"""\n'
        "import argparse\n\n"
        "from pyspark.sql import SparkSession\n\n\n"
        "def main(input_path: str, output_path: str) -> None:\n"
        '    spark = SparkSession.builder.appName("%s").getOrCreate()\n'
        "    df = spark.read.format(\"parquet\").load(input_path)\n"
        "    # TODO: transform\n"
        "    df.write.mode(\"overwrite\").format(\"parquet\").save(output_path)\n"
        "    spark.stop()\n\n\n"
        'if __name__ == "__main__":\n'
        "    parser = argparse.ArgumentParser()\n"
        '    parser.add_argument("--input", required=True)\n'
        '    parser.add_argument("--output", required=True)\n'
        "    args = parser.parse_args()\n"
        "    main(args.input, args.output)\n" % (name, name, name)
    )
    test_py = (
        "\"\"\"TODO: replace with a real transform test once %s_job.py is implemented.\"\"\"\n\n\n"
        "def test_placeholder():\n"
        "    assert True  # TODO: assert on the actual transform output\n" % name
    )
    write(out / "jobs" / f"{name}_job.py", py, force)
    write(out / "jobs" / f"test_{name}_job.py", test_py, force)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--kind", required=True, choices=["dbt", "airflow", "dagster", "spark"])
    ap.add_argument("--name", required=True, help="snake_case name for the model/DAG/asset/job")
    ap.add_argument("--layer", choices=LAYERS, help="medallion layer (dbt, dagster)")
    ap.add_argument("--out", default=".", help="project root to scaffold into (default: cwd)")
    ap.add_argument("--force", action="store_true", help="overwrite existing files")
    args = ap.parse_args(argv)

    out = Path(args.out)
    if args.kind == "dbt":
        scaffold_dbt(args.name, args.layer, out, args.force)
    elif args.kind == "airflow":
        scaffold_airflow(args.name, out, args.force)
    elif args.kind == "dagster":
        scaffold_dagster(args.name, args.layer, out, args.force)
    elif args.kind == "spark":
        scaffold_spark(args.name, out, args.force)
    return 0


if __name__ == "__main__":
    sys.exit(main())
