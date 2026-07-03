import { existsSync, readFileSync, readdirSync, statSync, watch } from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import { notFound } from "../lib/errors.ts";
import {
  templateConfigSchema,
  templateMapSchema,
  type RegisteredTemplate,
  type TemplateSummary,
} from "./types.ts";

/**
 * Template registry (spec §4). Scans the templates directory on startup,
 * validates each template's required files, and hot-reloads in development.
 * Templates are self-contained, so adding one requires no API/DB changes.
 */

const REQUIRED_FILES = ["resume.typ", "map.json", "config.json"] as const;

/** Matches `@preview/<name>:<version>` package imports inside resume.typ. */
const PACKAGE_IMPORT_RE = /@preview\/([a-z0-9-]+):(\d+\.\d+\.\d+)/g;

class TemplateRegistry {
  private templates = new Map<string, RegisteredTemplate>();
  private watcher: ReturnType<typeof watch> | null = null;
  /** Shared default cover-letter source; undefined = unloaded, null = missing. */
  private defaultCoverLetter: string | null | undefined;

  /** Scan the templates directory and (re)build the registry. */
  load(): void {
    const dir = config.templatesDir;
    this.templates.clear();
    this.defaultCoverLetter = undefined;

    if (!existsSync(dir)) {
      log.warn("Templates directory does not exist", { dir });
      return;
    }

    for (const entry of readdirSync(dir)) {
      const tplDir = path.join(dir, entry);
      if (!statSync(tplDir).isDirectory()) continue;
      this.loadOne(entry, tplDir);
    }

    log.info("Template registry loaded", {
      count: this.templates.size,
      templates: [...this.templates.keys()],
    });
  }

  /** Load (or reload) a single template directory by id. Returns success. */
  loadOne(id: string, tplDir: string): boolean {
    // Required-file validation (spec §4): skip with a warning if any is missing.
    for (const f of REQUIRED_FILES) {
      if (!existsSync(path.join(tplDir, f))) {
        log.warn(`Template ${id} skipped: missing ${f}`);
        this.templates.delete(id);
        return false;
      }
    }

    try {
      const source = readFileSync(path.join(tplDir, "resume.typ"), "utf8");
      const config_ = templateConfigSchema.parse(readJson(path.join(tplDir, "config.json")));
      const map = templateMapSchema.parse(readJson(path.join(tplDir, "map.json")));

      const missingPackages = this.checkVendoredPackages(id, source);

      // Cover-letter variant: a template's own cover-letter.typ, or the shared
      // default when it ships none, so every template can render a letter. Both
      // read the cover letter context from sys.inputs (spec: cover letters).
      const ownCoverLetterPath = path.join(tplDir, "cover-letter.typ");
      const coverLetterSource = existsSync(ownCoverLetterPath)
        ? readFileSync(ownCoverLetterPath, "utf8")
        : this.getDefaultCoverLetter();

      const tpl: RegisteredTemplate = {
        id,
        dir: tplDir,
        config: config_,
        map,
        source,
        coverLetterSource,
        hasCoverLetter: coverLetterSource !== undefined,
        hasThumbnail: existsSync(path.join(tplDir, "thumbnail.png")),
        missingPackages,
        renderable: missingPackages.length === 0,
      };
      this.templates.set(id, tpl);
      log.info(`Template ${id} registered`, {
        engine: tpl.config.engine,
        renderable: tpl.renderable,
      });
      return true;
    } catch (err) {
      log.warn(`Template ${id} skipped: invalid config/map`, { error: String(err) });
      this.templates.delete(id);
      return false;
    }
  }

  /**
   * Verify each @preview package imported by the template exists in the local
   * vendor cache (spec §4, §10). Missing packages flag the template as
   * potentially unrenderable but do not unregister it.
   */
  private checkVendoredPackages(id: string, source: string): string[] {
    const missing: string[] = [];
    for (const [, name, version] of source.matchAll(PACKAGE_IMPORT_RE)) {
      const manifest = path.join(config.typstCachePath, "preview", name!, version!, "typst.toml");
      if (!existsSync(manifest)) {
        log.warn(`Vendored package @preview/${name}:${version} not found in cache`, { template: id });
        missing.push(`@preview/${name}:${version}`);
      }
    }
    return missing;
  }

  /**
   * The shared default cover-letter.typ source, read once and cached. Templates
   * that do not ship their own cover-letter.typ fall back to this, so every
   * renderable template can produce a cover letter (spec: default cover letters).
   */
  private getDefaultCoverLetter(): string | undefined {
    if (this.defaultCoverLetter === undefined) {
      const p = path.join(config.templatesDir, "typst-coverletter", "cover-letter.typ");
      this.defaultCoverLetter = existsSync(p) ? readFileSync(p, "utf8") : null;
      if (this.defaultCoverLetter === null) {
        log.warn("Default cover-letter.typ not found — templates without their own letter cannot render one", { path: p });
      }
    }
    return this.defaultCoverLetter ?? undefined;
  }

  get(id: string): RegisteredTemplate | undefined {
    return this.templates.get(id);
  }

  /** Like `get`, but throws a 404 AppError when absent. */
  require(id: string): RegisteredTemplate {
    const tpl = this.templates.get(id);
    if (!tpl) throw notFound(`Template '${id}' not found`, "template_not_found", "template");
    return tpl;
  }

  has(id: string): boolean {
    return this.templates.has(id);
  }

  list(): RegisteredTemplate[] {
    return [...this.templates.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  summaries(): TemplateSummary[] {
    return this.list().map((t) => ({
      id: t.id,
      name: t.config.name,
      description: t.config.description,
      thumbnail_url: `/api/v1/templates/${t.id}/thumbnail`,
      paper_size: t.config.paperSize,
      engine: t.config.engine,
      has_cover_letter: t.hasCoverLetter,
    }));
  }

  /** Watch the templates directory for hot-reload in development (spec §4). */
  startWatching(): void {
    if (this.watcher || !config.isDev || !existsSync(config.templatesDir)) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    this.watcher = watch(config.templatesDir, { recursive: true }, () => {
      if (debounce) clearTimeout(debounce);
      // Debounce: a single file write fires many events; reload once it settles.
      debounce = setTimeout(() => {
        log.info("Templates changed — reloading registry");
        this.load();
      }, 300);
    });
    log.info("Watching templates directory for changes", { dir: config.templatesDir });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
  }
}

// --- small fs helper (sync, used only at load time) ---
function readJson(p: string): unknown {
  return JSON.parse(readFileSync(p, "utf8"));
}

export const templateRegistry = new TemplateRegistry();
