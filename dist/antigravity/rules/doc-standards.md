---
description: Apply a consistent professional house style (palette, type, tables/charts, layout) to Word, Excel, PDF or PowerPoint files. Use when creating, formatting or polishing a docx/xlsx/pdf/pptx or when asked to "look professional".
trigger: model_decision
---

# Doc Standards

A styling layer, not a document builder: it defines "professional" for the format-specific build skill.

## Procedure

1. **Build with the right base skill for the format:**
   - Word → `docx` skill
   - Excel → `xlsx` skill
   - PDF → `pdf` skill
   - PowerPoint → `pptx` skill

   Load that skill first for the actual file-format mechanics (this skill
   doesn't duplicate its API).

2. **Apply house style** from `_doc-standards/reference/house-style.md` — palette,
   typography, table/chart formatting, layout, accessibility. Apply it in one pass.

3. **Never fabricate content to fill the style.** A placeholder cell/row
   beats an invented number, same as this repo's design rules. If the
   user hasn't supplied real data for a table or chart, ask or leave a
   clearly-labeled placeholder.

4. **State what you changed, briefly.** One line naming the palette/font
   applied — not a design essay. Example: *"Applied house style: Aptos +
   steel-blue accent, hairline table borders, freeze header row."*

## Reference

- `_doc-standards/reference/house-style.md` — palette, typography, layout, accessibility. Read once per session unless the look changes.
