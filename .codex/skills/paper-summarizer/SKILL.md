---
name: paper-summarizer
description: Summarize Paperpile-synced academic papers in this paperpile-obsidian repository from a citekey input. Use for local structured summaries of papers stored under the configured Obsidian Papers library, especially quantitative social science papers.
---

# Paper Summarizer

Generate comprehensive, structured summaries of academic research papers that have already been synced by this `paperpile-obsidian` workflow.

This is a local citekey-based skill. Unlike a generic paper-summary skill, it does not take arbitrary PDF paths and does not fetch citations from the web. The source of truth is the configured Obsidian vault:

- `Papers/References/<citekey>.md` for metadata, abstract, and BibTeX
- `Papers/Bodies/<citekey>_body.md` for converted full text
- `Papers/Summaries/<citekey>_summary.md` as the Markdown output file

## Input

The input argument is a Paperpile citekey.

Examples:

```text
Summarize <citekey>
$paper-summarizer <citekey>
Create a structured summary of <citekey>
```

If the user gives a paper title, PDF path, or directory instead of a citekey, first try to map it to a local citekey only if the local `Papers/References` files make that unambiguous. Otherwise ask for the citekey.

## Output

The output is a Markdown summary note saved under the configured Obsidian Papers library:

```text
Papers/Summaries/<citekey>_summary.md
```

Use the `summary_path` returned by `resolve_paper.py` as the exact absolute output path. The filename must preserve the Paperpile citekey exactly and use the `_summary.md` suffix.

Default behavior:

- Generate the structured summary as Markdown.
- Save it to `Papers/Summaries/<citekey>_summary.md`.
- Return a short confirmation with the saved path and a brief summary preview.
- If the summary file already exists, read it before writing. Preserve clearly user-authored notes when possible; if a safe merge is unclear, ask before overwriting.
- If writing to the Obsidian vault fails with `Operation not permitted`, the vault is outside the current Codex writable sandbox. Request approval for the write or ask the user to add the vault path to writable roots, then retry the same `summary_path`.

## Scope

- Work only in this `paperpile-obsidian` repository and its configured Obsidian `Papers/` library.
- Use the local body note as the main evidence. Use the reference note only for title, authors, year, venue, DOI, abstract, tags, and BibTeX.
- Do not use WebSearch, Google Scholar, or external citation lookup unless the user explicitly asks for external verification.
- Do not derive a new Google Scholar-style citation key. Preserve the existing Paperpile citekey exactly.
- Do not overwrite user-authored content in an existing summary note without preserving it or getting confirmation.

## Resolve Local Files

Run:

```bash
python3 .codex/skills/paper-summarizer/scripts/resolve_paper.py <citekey>
```

The script prints JSON with absolute paths for `body_path`, `reference_path`, and `summary_path`. It reads `.env`, `config.json`, `OBSIDIAN_VAULT_PATH`, and `OBSIDIAN_PAPERS_FOLDER` when available.

If the body note is missing, empty, or contains only the "No PDF found" warning, clearly state that the local full text is unavailable. In that case, summarize only the reference metadata and abstract, and label the output as metadata/abstract-based rather than full-text-based.

## Reading Workflow

1. Read the reference note first, if it exists.

   Extract title, authors, year, journal or booktitle, DOI, tags, abstract, and BibTeX. Do not let the abstract substitute for full-text evidence when the body exists.

2. Inspect the body note structure.

   ```bash
   rg -n "^(#|##|###) " "<body_path>"
   ```

   For long converted Markdown, read selectively in chunks. Prioritize abstract, introduction, theory/literature, research design, data, methods, results, tables/figures, discussion, limitations, and conclusion.

3. Identify the paper's actual section organization.

   Academic papers often follow IMRaD, but social science papers may use theory, data, empirical strategy, results, mechanisms, robustness, and conclusion sections. Preserve the paper's own section titles where possible in the final summary.

4. Separate signal from conversion noise.

   Ignore repeated headers/footers, reference lists unless needed, page artifacts, broken line wraps, OCR fragments, and boilerplate. If section boundaries are damaged, say so briefly and summarize from recoverable text.

## What To Extract

For every paper:

- Title, authors, publication outlet or working paper series, year
- Abstract or abstract summary, preferably from the reference note or body text
- Central research question or puzzle
- Theoretical argument and hypotheses
- Literature or debate the paper speaks to
- Research design and unit of analysis
- Data source, sample, period, geography, and key variables
- Methods and empirical strategy
- Main findings, including concrete estimates when available
- Tables and figures that carry the main evidence
- Robustness checks, mechanisms, heterogeneity, and sensitivity analyses
- Limitations, caveats, and future research
- Distinctive contribution

For quantitative social science papers, be especially careful about:

- Identification strategy: natural experiment, instrumental variables, difference-in-differences, RDD, matching, fixed effects, synthetic control, experiments, panel design, or other causal strategy
- Endogeneity threats and how the authors address them
- Dependent variable, key independent variables, controls, fixed effects, clustered standard errors, and sample size
- Effect sizes, confidence intervals, p-values, signs, and substantive interpretation
- Which table columns or model specifications are central

## Output Format

Write the generated paper summary in English by default, including headings, prose, bullets, keywords, and notes. Use another language only when the user explicitly requests that language for the summary.

Use this structure by default:

```markdown
---
citekey: <existing Paperpile citekey>
title: <Full Paper Title>
authors: <First Last, First Last, and First Last>
year: <YYYY>
journal: <Journal, booktitle, working paper series, or N/A>
doi: <DOI or N/A>
keywords: [keyword1, keyword2, keyword3, keyword4, keyword5]
source: <full-text | metadata-and-abstract-only>
bibtex: |
  <BibTeX from the reference note, if available>
---

# <Full Paper Title>

## Abstract

<Briefly summarize the paper's abstract. Avoid pasting long verbatim passages; use only short quotations when necessary.>

## One-Sentence Summary

<One sentence explaining what the paper asks, does, and finds.>

# Summary

## <Original Section Title or Introduction/Research Question>

- Central research question or puzzle
- Why the question matters
- Hypotheses or theoretical predictions, if present

## <Original Section Title or Literature Review>

- Prior literature and debate
- Theoretical framework
- How this paper contributes to or challenges existing work

## <Original Section Title or Argument Formation>

- Main claim or mechanism
- How the authors' argument differs from previous studies
- Why the argument is worth testing

## <Original Section Title or Research Design>

- Study type
- Unit of analysis
- Time period and geographic scope
- Empirical strategy or identification strategy

### Data

- Data sources and data generation process
- Sample size and coverage
- Key variables and measurement
- Data limitations acknowledged by the authors

### Methods

- Primary statistical or analytical methods
- Identification strategy and endogeneity handling
- Robustness checks or sensitivity analyses
- For qualitative work, case selection and process tracing logic

## <Original Section Title or Results>

- Main findings for each question or hypothesis
- Effect sizes and statistical significance where reported
- Key tables and figures, including dependent variables and central specifications
- Heterogeneity, mechanisms, and robustness findings

## <Original Section Title or Discussion and Implications>

- Authors' interpretation
- Theoretical implications
- Policy implications, if discussed
- Limitations and caveats
- Future research

## Notes

- Additional observations, useful connections, open questions, or reading notes
```

If the user asks for a shorter answer, compress the same logic into:

- Paper
- One-Sentence Summary
- Research Question
- Data and Methods
- Main Findings
- Contribution
- Limitations
- Keywords

## Tables And Figures

For key result tables:

- Identify the dependent variable and main independent variables.
- Note the most important model specifications, often the fullest or preferred columns.
- Extract coefficient estimates, standard errors, confidence intervals, p-values, sample sizes, and fit statistics when they are readable and relevant.
- Explain the substantive size of the result, not just the sign.

For figures:

- Describe what the visualization shows.
- Note the key pattern or takeaway.
- For coefficient plots or event studies, report direction, timing, confidence intervals, and whether estimates support the claimed design.

Do not transcribe every table or figure. Focus on evidence necessary to understand the paper's claims.

## Quality Bar

- Understand the argument rather than only extracting sentences.
- Be specific about sample, period, method, model, effect size, and evidence.
- Use the authors' technical terms when they matter.
- Distinguish body-derived findings from abstract-only or metadata-only inference.
- Do not invent methods, datasets, results, limitations, or citations.
- Be neutral and descriptive. This is a summary, not a peer review unless the user asks for critique.
- Preserve the Paperpile citekey exactly in output and paths.
