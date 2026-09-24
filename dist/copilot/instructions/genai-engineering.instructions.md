---
description: Builds and hardens LLM applications — RAG pipelines, tool-using agents, prompt/model selection, eval harnesses, guardrails, and cost/latency control (prompt caching, batching, model tiering). Use when the user is building or debugging a RAG system, an LLM feature, an agent, an eval set, or asks why an LLM app is slow, expensive, or hallucinating.
applyTo: **
---

# GenAI Engineering

LLM apps fail in predictable places: retrieval, not generation; missing
evals, not missing prompts; and cost that nobody measured. Work in that
order.

## Procedure

1. **Eval before tuning.** Before changing a prompt, model, or chunker,
   make sure a small eval set exists (20-50 real cases with expected
   outcomes). No eval set → build one first; see
   `_genai-engineering/reference/patterns.md#evals`. Every later change is judged against it.

2. **Diagnose the layer.** For a bad answer, check in order: was the right
   context retrieved (retrieval recall)? Was it in the prompt (context
   assembly)? Did the model use it (generation)? Fix the first broken
   layer only. Most "hallucination" bugs are retrieval bugs.

3. **Pick the smallest thing that works.** Long-context stuffing before
   RAG for small corpora; hybrid (BM25 + vector) before a fancier
   retriever; a single well-scoped call before an agent loop; a cheaper
   model tier for classification/extraction, the strong model only where
   evals show it's needed.

4. **Control cost and latency explicitly.** Stable prefix first (system
   prompt, tools, few-shot) so prompt caching hits; batch APIs for
   offline jobs; cap max output tokens; log tokens-in/out and latency per
   call. Numbers, not vibes.

5. **Guard the trust boundary.** Retrieved documents and tool outputs are
   untrusted input — never let them issue instructions (prompt
   injection). Redact PII before it hits a third-party model; validate
   structured output against a schema.

6. **Hand off** implementation-heavy work to the `ml-engineer` subagent
   with the eval set, the broken layer, and the target metric named.

## Reference

- `_genai-engineering/reference/patterns.md` — RAG design choices, eval harness shape,
  agent loop rules, cost/latency levers, guardrail checklist.

## Token economy

- Read the prompt template, retrieval config, and one failing trace —
  not the whole app — before proposing a change.
- Run evals as a script that prints a pass-rate summary, not per-case
  dumps; open individual failures only when diagnosing.
- General read/search/output patterns live in the `token-saver` skill.
