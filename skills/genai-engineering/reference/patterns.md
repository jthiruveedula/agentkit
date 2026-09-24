# GenAI engineering patterns

## RAG

| Choice | Default | Change when |
|---|---|---|
| Corpus < ~200k tokens | Stuff it in context + prompt caching | Corpus grows or changes per user |
| Chunking | Structure-aware (headings/sections), 300-800 tokens, small overlap | Evals show answers split across chunks |
| Retrieval | Hybrid BM25 + dense, top-k 10-20 | Recall@k on evals already > 0.9 |
| Reranking | Cross-encoder/reranker over top-k, keep 3-8 | Latency budget can't afford it |
| Metadata | Filter by tenant/date/source before similarity | Never skip tenant filters (security) |
| Citations | Return chunk IDs with every answer | — |

Measure retrieval separately: recall@k and MRR against labeled
question→chunk pairs. Generation metrics are meaningless if recall is bad.

## Evals

- 20-50 cases to start, drawn from real usage, including known failures.
- Each case: input, expected answer or rubric, and (for RAG) expected
  source chunk IDs.
- Grade with exact/regex/schema checks where possible; LLM-as-judge only
  for open-ended answers, with a written rubric and a spot-checked sample.
- Track: pass rate, cost per case, p50/p95 latency. Commit the eval set;
  run it in CI on prompt/model changes.

### RAG evals

Four Ragas-style metrics, each answers a different question:

| Metric | Question it answers |
|---|---|
| Faithfulness | Is every claim in the answer supported by the retrieved context? (catches hallucination) |
| Answer relevancy | Does the answer actually address the question asked? |
| Context precision | Of the chunks retrieved, how many were actually relevant? |
| Context recall | Of the chunks needed to answer, how many were retrieved? |

LLM-as-judge bias mitigations (a judge model has the same blind spots a
human grader does):

- Swap answer order/position across repeated judge calls — judges favor
  whichever answer they see first.
- Give the judge a written rubric, not just "rate 1-5" — vague criteria
  drift between cases.
- Grade against a reference answer where one exists, not vibes alone.
- Spot-check a sample of judge scores by hand; don't fully trust an
  ungraded judge.
- Use a different model family for judge than for generation — a model
  judging its own output is biased toward its own style.

Minimal harness outline (stdlib only, no vendor eval framework required):

```python
def run_eval(cases):
    results = []
    for case in cases:  # case: {input, expected, ...}
        t0 = time.time()
        chunks = retrieve(case["input"])
        answer = generate(case["input"], chunks)
        score = score_case(case, chunks, answer)  # exact/schema, or judge call
        results.append(
            {
                "id": case["id"],
                "score": score,
                "cost": estimate_cost(chunks, answer),
                "latency_s": time.time() - t0,
            }
        )
    return {
        "pass_rate": sum(r["score"] >= case_threshold for r in results) / len(results),
        "cost_total": sum(r["cost"] for r in results),
        "p50_latency": statistics.median(r["latency_s"] for r in results),
        "failures": [r for r in results if r["score"] < case_threshold],
    }
```

## Agents

- Start with one call + tools; add a loop only when a task needs
  multi-step decisions.
- Cap iterations and total tokens; log every tool call.
- Tools return compact, structured results — agents drown in raw dumps.
- Human confirmation before irreversible or outward-facing actions.

## Cost & latency levers

1. Prompt caching: stable prefix (system, tools, docs) first, variable
   input last. Don't reorder or timestamp the prefix.
2. Model tiering: small model for routing/classification/extraction,
   strong model for reasoning; decide per step by eval, not by default.
3. Batch APIs for offline/bulk work (typically ~50% cheaper).
4. Cap `max_tokens`; ask for structured output instead of prose.
5. Stream for perceived latency; parallelize independent calls.

## Guardrails checklist

- [ ] Retrieved text/tool output treated as data, never instructions
- [ ] PII redaction before external model calls; retention settings known
- [ ] Structured outputs validated against a schema, with a retry path
- [ ] Tenant/permission filter applied at retrieval, not after generation
- [ ] Rate limits and per-user spend caps
- [ ] Eval set includes adversarial/injection cases
