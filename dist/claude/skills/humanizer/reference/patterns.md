# Detector rules

What `scripts/detect.py` flags, and the usual fix. Weights feed the score: points per 100 words, doubled, capped at 100. Threshold 35. `grammar` rules have weight 0: they get listed and fixed but don't count toward the score.

| Rule | Weight | Fires on | Fix |
|---|---|---|---|
| `stock-phrase` | 2-3 | delve, tapestry, testament to, "it's worth noting", "in today's fast-paced world", ever-evolving, "plays a crucial role", "unlock the power", seamless, pivotal, "great question", "I hope this helps" | Plain word, or the specific fact already in the text. Often the sentence can go. |
| `soft-phrase` | 1 | robust, leverage, crucial, comprehensive, streamline, empower, journey, landscape, foster, "serves as a" | Fine alone. Cut when they pile up, and keep them when they are the technical term ("robust regression"). |
| `hedge-filler` | 1-2 | "it's important to note", "needless to say", "may potentially", "when it comes to", arguably, essentially, truly | Delete, unless the doubt is real. Then state the doubt once, plainly. |
| `not-x-but-y` | 2-3 | "not just X, but Y", "it's not X, it's Y", "isn't just", "This isn't X. It's Y." | Say Y. Keep the contrast only when a reader really believes X. |
| `summary-closer` | 2 | Lines that open with In conclusion / Overall / Ultimately / In short; "let me know if", "feel free to" | Cut the recap, end on the last real point, and drop chat sign-offs. |
| `generic-heading` | 2 | Key Takeaways, Final Thoughts, "Unlocking ...", "The Power of ...". In `--slides`, any short title line, and Introduction/Overview/Summary/Conclusion too (normal doc section titles otherwise) | Name the content ("Retries and backoff") or, on slides, the claim. |
| `emoji-bullet` | 2 | A list item or line starting with a pictograph emoji (check marks like ✓ ✔ are left alone) | Remove the emoji. |
| `bold-label` | 1 | 3+ list items starting `**Label:**` | Plain list items, or a table if the labels are real keys. |
| `rule-of-three` | 1 | 3+ "A, B, and C" lists in one text | Keep the lists whose content has three parts. Cut the rest to the one or two that matter. |
| `em-dash` | 1 | 3+ dashes (`—`, ` -- `, ` – `) at ≥0.75 per 100 words | Comma, colon, parentheses or a new sentence. Keep the author's rate if a voice sample uses them. |
| `repeated-opener` | 2 | 3 sentences in a row in one paragraph starting with the same word | Merge, reorder or change the subject. |
| `uniform-length` | 4 | 6+ prose sentences with length CV < 0.3 | Mix short and long sentences. Merge some, split one. |
| `long-bullet` | 1 | `--slides` only: bullets over 12 words | Shorten to a fragment and move the rest to speaker notes. |
| `doubled-word` | 0 | "the the" (except "that that", "had had") | Delete one. |
| `space-before-punct` | 0 | "word ," | Remove the space. |

Ignored: fenced code (any fence length; an unclosed fence runs to the end), YAML front matter, table rows, inline code, URLs. Indented lines are read as prose, because list continuations are more common than indented code. Phrase rules match across hard-wrapped lines. The detector is English-only.

## Fact guard

`detect.py <rewrite> --against <original>` compares fenced code blocks, front matter, inline code, URLs, markdown link targets and numbers, with counts, so a dropped repeat is caught. Dates, ranges and versions (`2024-01-15`, `10-20`, `v1.2.3`) stay single tokens, and `1,000` equals `1000`. Names, quotes and meaning are not checked: read for those. `lost` means something the rewrite dropped or changed: restore it. `added` means a number or code span the original lacked: delete it unless the user supplied it. Exit 1 on any difference.

## Limits

These are heuristics. A score under 35 doesn't make text good, and a careful human writer can trip a rule on purpose. Use the score to find lines, and the rewrite judgment to fix them. For deeper patterns (staged run-ups, borrowed authority, writing about the document, re-explaining what the reader knows), see the pinned upstream catalog `external/humanizer/SKILL.md`.
