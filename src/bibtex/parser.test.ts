import { test, expect, describe } from "bun:test";
import { parseBibTeX, diffNewEntries } from "./parser.ts";

const SAMPLE_BIB = `
@article{Smith2023,
  author = {Smith, John and Doe, Jane},
  title = {The Effect of X on Y: {Evidence} from {Vietnam}},
  year = {2023},
  journal = {Journal of Development Economics},
  doi = {10.1016/j.jdeveco.2023.01.001},
  abstract = {We study the causal effect of X on Y using data from Vietnam.},
  keywords = {development, Vietnam, causal}
}

@book{Jones2021,
  author = {Jones, Robert},
  title = {\\emph{Political Economy of Southeast Asia}},
  year = {2021},
  publisher = {Oxford University Press},
}
`;

describe("parseBibTeX", () => {
  test("parses citekeys correctly", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    expect(entries.map((e) => e.citekey)).toEqual(["Smith2023", "Jones2021"]);
  });

  test("parses authors correctly", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    expect(entries[0].authors).toEqual(["Smith, John", "Doe, Jane"]);
    expect(entries[1].authors).toEqual(["Jones, Robert"]);
  });

  test("cleans LaTeX markup from title", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    expect(entries[0].title).toBe("The Effect of X on Y: Evidence from Vietnam");
    // \emph{} should be stripped
    expect(entries[1].title).toBe("Political Economy of Southeast Asia");
  });

  test("parses DOI, abstract, and keywords", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    const smith = entries[0];
    expect(smith.doi).toBe("10.1016/j.jdeveco.2023.01.001");
    expect(smith.abstract).toContain("causal effect");
    expect(smith.tags).toEqual(["development", "Vietnam", "causal"]);
  });
});

describe("diffNewEntries", () => {
  test("returns only unprocessed entries", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    const processed = new Set(["Smith2023"]);
    const newEntries = diffNewEntries(entries, processed);
    expect(newEntries.map((e) => e.citekey)).toEqual(["Jones2021"]);
  });

  test("returns all entries when registry is empty", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    const newEntries = diffNewEntries(entries, new Set());
    expect(newEntries).toHaveLength(2);
  });

  test("returns empty array when all are processed", () => {
    const entries = parseBibTeX(SAMPLE_BIB);
    const processed = new Set(["Smith2023", "Jones2021"]);
    const newEntries = diffNewEntries(entries, processed);
    expect(newEntries).toHaveLength(0);
  });
});
