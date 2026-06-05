import { NodeCompiler, type NodeError } from "@myriaddreamin/typst-ts-node-compiler";
import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import { renderFailed } from "../lib/errors.ts";

/**
 * A single render worker (spec §8, §9). Wraps exactly one long-lived
 * NodeCompiler instance — instances are never shared across concurrent renders.
 * `evictCache(10)` is called after every render without exception, on success,
 * error and timeout paths alike.
 */

/** Virtual path the template source is mounted at inside the compiler's vfs. */
const VIRTUAL_MAIN = "/main.typ";

export interface RenderInput {
  templateId: string;
  /** resume.typ content, read once at registry load and reused via addSource. */
  source: string;
  /** JSON.stringify(context) — passed verbatim as sys.inputs.resume. */
  resumeJson: string;
  /** Output format. Defaults to "pdf"; "svg" is used for card thumbnails. */
  format?: "pdf" | "svg";
}

export interface RenderOutput {
  /** Present when format is "pdf". */
  pdf?: Uint8Array;
  /** Present when format is "svg". */
  svg?: string;
  warnings: string[];
}

export class RenderWorker {
  readonly id: number;
  private readonly compiler: NodeCompiler;

  constructor(id: number) {
    this.id = id;
    // Every worker gets identical font configuration so output is deterministic
    // across the pool (spec §11). System fonts are not relied upon.
    this.compiler = NodeCompiler.create({
      // Mount the workspace root at "/" so our in-memory VIRTUAL_MAIN path
      // ("/main.typ") resolves regardless of the process working directory.
      workspace: "/",
      fontArgs: config.fontPaths.length ? [{ fontPaths: config.fontPaths }] : [],
    });
    log.debug("Render worker created", { worker: id, fontPaths: config.fontPaths });
  }

  /**
   * Render a template to a PDF buffer entirely in memory. Throws an AppError
   * (renderFailed) with Typst diagnostics on compilation failure.
   */
  render(input: RenderInput): RenderOutput {
    try {
      // addSource mounts the template in the virtual filesystem — no disk read
      // happens during compilation (spec §8).
      this.compiler.addSource(VIRTUAL_MAIN, input.source);

      const result = this.compiler.compile({
        mainFilePath: VIRTUAL_MAIN,
        inputs: { resume: input.resumeJson },
      });

      if (result.hasError()) {
        const err = result.takeError();
        throw this.toRenderError(input.templateId, err);
      }

      const warnings = diagnosticsToStrings(result.takeWarnings());
      for (const w of warnings) {
        log.warn("Typst render warning", { template: input.templateId, detail: w });
      }

      const doc = result.result;
      if (!doc) throw renderFailed("Render failed: Typst produced no document", { template: input.templateId });

      if (input.format === "svg") {
        // SVG of the rendered document — used as the card thumbnail. (Note:
        // plainSvg panics in this binding rc; svg() is the safe export path.)
        return { svg: this.compiler.svg(doc), warnings };
      }
      // pdf() returns a Node Buffer, which is a Uint8Array.
      const pdf = this.compiler.pdf(doc);
      return { pdf, warnings };
    } finally {
      // Called on success AND error paths — never skipped (spec §8).
      this.compiler.evictCache(10);
    }
  }

  /** Map a Typst NodeError into a structured AppError with diagnostics. */
  private toRenderError(templateId: string, err: NodeError | null) {
    const diagnostics = diagnosticsToStrings(err);
    const detail = diagnostics.join("\n");

    // Distinguish the common "vendored package missing" case (spec §10, §19).
    const pkg = detail.match(/package @([\w/-]+:[\d.]+)/)?.[1] ?? detail.match(/@preview\/[\w-]+:[\d.]+/)?.[0];
    if (/package/i.test(detail) && /(not found|unknown|failed to (load|download))/i.test(detail)) {
      const name = pkg ?? "unknown";
      return renderFailed(`Render failed: package ${name} not found in vendor cache`, {
        template: templateId,
        detail,
        hint: "Add the package to the vendor directory and rebuild the image",
      });
    }

    return renderFailed("Render failed: Typst compilation error", {
      template: templateId,
      detail: detail || (err?.kind ?? "unknown error"),
    });
  }
}

/** Flatten a NodeError's short diagnostics into readable strings. */
function diagnosticsToStrings(err: NodeError | null): string[] {
  if (!err) return [];
  const diags = err.shortDiagnostics ?? [];
  return diags.map((d: unknown) => {
    if (typeof d === "string") return d;
    if (d && typeof d === "object") {
      const o = d as { message?: string; path?: string; range?: unknown };
      return o.message ? `${o.path ? `${o.path}: ` : ""}${o.message}` : JSON.stringify(d);
    }
    return String(d);
  });
}
