import { describe, expect, test } from "bun:test";
import { firstPageOnly } from "./index.ts";

/** Minimal stand-in for a rich Typst svg() export with N stacked pages. */
function fakeSvg(pages: number, pageW = 612, pageH = 792): string {
  const total = pageH * pages;
  const groups = Array.from({ length: pages }, (_, i) =>
    `<g class="typst-page" transform="translate(0, ${i * pageH})" data-tid="p${i}" ` +
    `data-page-width="${pageW}" data-page-height="${pageH}"><rect/></g>`,
  ).join("");
  return (
    `<svg style="overflow: visible;" class="typst-doc" viewBox="0 0 ${pageW}.000 ${total}.000" ` +
    `width="${pageW}.000" height="${total}.000" data-width="${pageW}.000" data-height="${total}.000">` +
    `<defs></defs>${groups}</svg>`
  );
}

describe("firstPageOnly", () => {
  test("crops a multi-page SVG viewport to the first page", () => {
    const cropped = firstPageOnly(fakeSvg(3));
    const root = cropped.slice(0, cropped.indexOf(">") + 1);
    expect(root).toContain('viewBox="0 0 612 792"');
    expect(root).toContain(' width="612"');
    expect(root).toContain(' height="792"');
    expect(root).toContain('data-width="612"');
    expect(root).toContain('data-height="792"');
    // Overflow must clip so later pages don't bleed past the cropped viewport.
    expect(root).toContain("overflow: hidden");
    expect(root).not.toContain("overflow: visible");
  });

  test("leaves a single-page SVG's dimensions intact", () => {
    const cropped = firstPageOnly(fakeSvg(1));
    const root = cropped.slice(0, cropped.indexOf(">") + 1);
    expect(root).toContain('viewBox="0 0 612 792"');
    expect(root).toContain(' height="792"');
  });

  test("returns input unchanged when no typst-page group is present", () => {
    const svg = '<svg viewBox="0 0 10 10"><rect/></svg>';
    expect(firstPageOnly(svg)).toBe(svg);
  });
})
