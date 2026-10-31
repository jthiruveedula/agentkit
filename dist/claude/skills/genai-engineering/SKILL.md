---
name: genai-engineering
description: Build and harden LLM apps: RAG, agents, evals, guardrails, cost/latency. Use when building or debugging a RAG system, LLM feature, agent or eval set, or when an LLM app is slow, costly or hallucinating.
allowed-tools: Read, Edit, Write, Grep
version: 0.1.0
---

# GenAI Engineering

LLM apps fail in retrieval, missing evals, and unmeasured cost. Work in that order.

## Procedure

1. **Eval before tuning.** Before changing a prompt, model, or chunker,
   make sure a small eval set exists (20-50 real cases with expected
   outcomes). No eval set → build one first; see
   `reference/patterns.md#evals`. For RAG, score retrieval and generation
   separately with the four Ragas-style metrics in `reference/patterns.md#rag-evals`.
   Every later change is judged against it.

2. **Diagnose the layer.** For a bad answer, check in order: was the right
   context retrieved (retrieval recall)? Was it in the prompt (context
   assembly)? Did the model use it (generation)? Fix the first broken
   layer only. Most "hallucination" bugs are retrieval bugs.

3. **Pick the smallest thing that works.** Long-context stuffing before
   RAG for small corpora; hybrid (BM25 + vector) before a fancier
   retriever; a single well-scoped call before an agent loop; a cheaper
   model tier for classification/extraction, the strong model only where
   evals show it's needed. To check a GGUF/safetensors file's
   metadata and tensor totals without loading it, use `ext-rea`.

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
7. **Verify:** re-run the eval set after each change; if the score drops, revert or fix and re-run until it recovers.

## Reference

- `reference/patterns.md` — RAG design choices, eval harness shape,
  agent loop rules, cost/latency levers, guardrail checklist.

## Token economy

- Read the prompt template, retrieval config and one failing trace, not the whole app.
- Evals print a pass-rate summary; open single failures only to diagnose.
