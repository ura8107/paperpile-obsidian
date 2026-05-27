import { describe, expect, test } from "bun:test";
import { mergePaperpileJsonExport } from "./jsonExport.ts";
import type { PaperEntry } from "../types.ts";

const BASE_ENTRY: PaperEntry = {
  citekey: "Smith2023",
  title: "The Effect of X on Y",
  authors: ["Smith, John"],
  year: "2023",
  doi: "10.1000/example",
  rawBibtex: "@article{Smith2023}",
};

describe("mergePaperpileJsonExport", () => {
  test("merges folders and labels by citekey with ID lookup", () => {
    const rawJson = JSON.stringify({
      folders: [{ id: "folder-1", name: "Dissertation" }],
      labels: [{ id: "label-1", name: "Causal Inference" }],
      references: [
        {
          citekey: "Smith2023",
          title: "The Effect of X on Y",
          folderIds: ["folder-1"],
          labelIds: ["label-1"],
        },
      ],
    });

    const [entry] = mergePaperpileJsonExport([BASE_ENTRY], rawJson);

    expect(entry.paperpileFolders).toEqual(["Dissertation"]);
    expect(entry.paperpileLabels).toEqual(["Causal Inference"]);
  });

  test("merges folders and labels by DOI when citekey is absent", () => {
    const rawJson = JSON.stringify({
      papers: [
        {
          doi: "https://doi.org/10.1000/example",
          folders: [{ name: "Methods" }],
          labels: ["survey"],
        },
      ],
    });

    const [entry] = mergePaperpileJsonExport([BASE_ENTRY], rawJson);

    expect(entry.paperpileFolders).toEqual(["Methods"]);
    expect(entry.paperpileLabels).toEqual(["survey"]);
  });

  test("prefers Paperpile foldersNamed and labelsNamed over UUID fields", () => {
    const rawJson = JSON.stringify([
      {
        citekey: "Smith2023",
        folders: ["00796caa-8b5e-4033-9719-6b28eb6c6724"],
        foldersNamed: ["mthesis/misc"],
        labels: ["4f98035c-ace7-47aa-84ee-24d8ff47cec7"],
        labelsNamed: ["Econ_RG"],
      },
    ]);

    const [entry] = mergePaperpileJsonExport([BASE_ENTRY], rawJson);

    expect(entry.paperpileFolders).toEqual(["mthesis/misc"]);
    expect(entry.paperpileLabels).toEqual(["Econ_RG"]);
  });
});
