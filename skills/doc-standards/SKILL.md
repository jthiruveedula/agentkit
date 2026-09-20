---
name: doc-standards
description: Applies a consistent professional house style (colors, typography, table/chart formatting, layout) whenever generating or editing a Word, Excel, PDF, or PowerPoint document. Use when the user asks to create, format, or polish a docx, xlsx, pdf, or pptx file, or asks for a document to "look professional".
version: 0.1.0
allowed-tools: Bash, Read
---

# Doc Standards

A styling layer, not a document builder. It doesn't replace the format-
specific build skill — it tells that skill what "professional and
polished" means once the file exists, so a spreadsheet and a report this
repo produces look like they came from the same place.

## Procedure

1. **Build with the right base skill for the format:**
   - Word → `docx` skill
   - Excel → `xlsx` skill
   - PDF → `pdf` skill
   - PowerPoint → `pptx` skill

   Load that skill first for the actual file-format mechanics (this skill
   doesn't duplicate its API).

2. **Apply house style** from `reference/house-style.md` — palette,
   typography, table/chart formatting, layout, accessibility. Read it
   once per document, not once per element; it's short enough to hold in
   context for the whole build.

3. **Never fabricate content to fill the style.** A placeholder cell/row
   beats an invented number, same as this repo's design rules. If the
   user hasn't supplied real data for a table or chart, ask or leave a
   clearly-labeled placeholder.

4. **State what you changed, briefly.** One line naming the palette/font
   applied — not a design essay. Example: *"Applied house style: Aptos +
   steel-blue accent, hairline table borders, freeze header row."*

## Reference

- `reference/house-style.md` — the full palette, typography, layout, and
  accessibility rules. Load in full before the first document build in a
  session; subsequent documents in the same session can skip re-reading
  it unless the user asks for a different look.
