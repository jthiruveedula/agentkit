# House style — Word / Excel / PDF / PowerPoint

Applied on top of whichever base skill builds the file
(`anthropic-skills:docx` / `xlsx` / `pdf` / `pptx`). The base skill knows
*how* to build the file format; this file says what "professional and
polished" means once it's built, so two documents this repo produces look
like they came from the same place.

## Palette

Office apps don't do OKLCH — plain hex, picked for print + screen and
WCAG AA contrast against white.

| Role | Hex | Use |
|---|---|---|
| Ink (body text) | `#1F2A37` | body copy, table text |
| Heading | `#13202E` | H1/H2/title text |
| Accent | `#2E5A88` | headings' rule/underline, chart series 1, link color, active cell fill |
| Accent, light | `#D9E4F0` | header row fill, callout box fill |
| Neutral band | `#F4F5F7` | alternating table row shading |
| Border | `#D7DBE0` | table borders, cell gridlines (hairline, never heavy black) |
| Negative / warning | `#B3261E` | negative numbers, error states — never the only signal, pair with a minus sign or icon |
| Positive | `#1D7A4C` | positive variance, "on track" status |

**Never** default Office blue (`#4472C4`)/orange/grey theme colors
unmodified — that's the template tell. Never more than one accent hue per
document. Chart series beyond the first two step through the accent's
lightness (light → dark), not a rainbow.

## Typography

- **Headings & body:** `Aptos` (Word/Excel 2024+ default) with `Calibri`
  fallback for older installs — both ship with Office, no font-embedding
  risk when the file leaves this machine.
- **Tabular/code:** `Consolas` for any monospace need (formulas shown as
  text, code samples).
- **Sizes (Word):** Title 24pt bold, H1 18pt bold, H2 14pt bold, H3 12pt
  bold, body 11pt. **Sizes (Excel):** header row 11pt bold, body 10–11pt.
- One heading weight jump per level — never skip from Title straight to
  H3 styling.
- Numbers: thousands separator, 2 decimal places for currency, right-
  aligned in tables, negative numbers in parentheses `(1,234.00)` not a
  bare minus sign (accounting convention) unless the user's domain uses
  the minus-sign convention instead — ask if unclear, don't guess.

## Layout

- **Word:** 1" margins, page numbers bottom-center, a title page for
  anything over ~3 pages (title, one-line subtitle, date, author/team —
  no fabricated "Confidential" banner unless the user says the doc is
  confidential). Table of contents (auto-generated field, not typed) for
  anything with 4+ H1 sections.
- **Excel:** freeze the header row, auto-fit column widths, header row
  filled with Accent-light + bold text, alternating row bands at Neutral
  band (never on the header row), borders hairline on all data cells,
  no borders inside a merged title/legend area.
- **PDF (via docx/pptx export or direct):** same margin/heading rules as
  Word; page numbers + a running footer with the document title.
- **PowerPoint:** title-only slides for section breaks, consistent
  content-slide template (title + one content region — avoid free-floating
  text boxes scattered per slide), one accent color used for emphasis only
  (never a full-slide accent-color background).

## Accessibility & data integrity

- Every image/chart needs alt text describing what it shows, not just
  "chart1".
- Never invent numbers to fill a table or chart — an empty/placeholder
  cell beats a fabricated one (same rule as this repo's design skill).
- Cite the data source (sheet/query/date) in a footnote or caption when
  the numbers came from somewhere specific.
- Color is never the only signal (e.g. red/green status) — pair with text
  or an icon for colorblind readers.

## What "polished" means, concretely

A polished document has: one font pair, one accent color used sparingly,
consistent heading sizes top to bottom, tables with real headers and
hairline borders (not the app's raw default gridlines), no orphaned
single-row tables, no default-blue chart theme, and a title/date on
anything meant to be shared outside the current conversation.
