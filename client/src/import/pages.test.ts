import { describe, expect, it } from "vitest";
import {
  imageMime,
  isArchiveName,
  isPageFile,
  nextChapterNumber,
  sortNaturally,
  titleFromFileName,
} from "./pages.ts";

describe("isPageFile", () => {
  it("accepts images and rejects everything else", () => {
    expect(isPageFile("001.jpg")).toBe(true);
    expect(isPageFile("ch1/Page 2.PNG")).toBe(true);
    expect(isPageFile("a.webp")).toBe(true);
    expect(isPageFile("notes.txt")).toBe(false);
    expect(isPageFile("ComicInfo.xml")).toBe(false);
    expect(isPageFile("noextension")).toBe(false);
  });

  it("ignores OS metadata and dotfiles", () => {
    expect(isPageFile("__MACOSX/ch1/._001.jpg")).toBe(false);
    expect(isPageFile("ch1/.hidden.jpg")).toBe(false);
    expect(isPageFile("__MACOSX/001.jpg")).toBe(false);
  });

  it("handles Windows separators", () => {
    expect(isPageFile("ch1\\001.jpg")).toBe(true);
    expect(isPageFile("__MACOSX\\001.jpg")).toBe(false);
  });
});

describe("imageMime", () => {
  it("maps extensions case-insensitively", () => {
    expect(imageMime("x.JPG")).toBe("image/jpeg");
    expect(imageMime("x.jpeg")).toBe("image/jpeg");
    expect(imageMime("x.png")).toBe("image/png");
    expect(imageMime("x.pdf")).toBeNull();
  });
});

describe("isArchiveName", () => {
  it("recognises cbz and zip only", () => {
    expect(isArchiveName("a.cbz")).toBe(true);
    expect(isArchiveName("a.ZIP")).toBe(true);
    expect(isArchiveName("a.cbr")).toBe(false);
    expect(isArchiveName("a.jpg")).toBe(false);
  });
});

describe("sortNaturally", () => {
  it("puts 2 before 10", () => {
    const names = ["10.jpg", "2.jpg", "1.jpg", "21.jpg", "3.jpg"];
    expect(sortNaturally(names, (n) => n)).toEqual(["1.jpg", "2.jpg", "3.jpg", "10.jpg", "21.jpg"]);
  });

  it("handles prefixes and mixed case", () => {
    const names = ["page10.png", "Page2.png", "page1.png"];
    expect(sortNaturally(names, (n) => n)).toEqual(["page1.png", "Page2.png", "page10.png"]);
  });

  it("does not mutate the input", () => {
    const input = ["b", "a"];
    sortNaturally(input, (n) => n);
    expect(input).toEqual(["b", "a"]);
  });
});

describe("nextChapterNumber", () => {
  it("is 1 for a new series and highest + 1 otherwise", () => {
    expect(nextChapterNumber([])).toBe(1);
    expect(nextChapterNumber([1, 2, 3])).toBe(4);
    expect(nextChapterNumber([5, 1])).toBe(6);
  });
});

describe("titleFromFileName", () => {
  it("drops the extension and tidies separators", () => {
    expect(titleFromFileName("my_cool-series.cbz")).toBe("my cool series");
    expect(titleFromFileName("Tower  of God.zip")).toBe("Tower of God");
    expect(titleFromFileName("noext")).toBe("noext");
  });
});
