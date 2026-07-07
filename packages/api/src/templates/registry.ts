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

/** The letter design used when neither the letter nor its template picks one. */
export const DEFAULT_LETTER_TEMPLATE_ID = "din5008-coverletter";

/** A selectable cover-letter design: any template dir shipping a cover-letter.typ. */
export interface LetterTemplate {
  id: string;
  source: string;
  name: string;
  description: string;
}

class TemplateRegistry {
  private templates = new Map<string, RegisteredTemplate>();
  private letterTemplates = new Map<string, LetterTemplate>();
  private watcher: ReturnType<typeof watch> | null = null;

  /** Scan the templates directory and (re)build the registry. */
  load(): void {
    const dir = config.templatesDir;
    this.templates.clear();
    this.letterTemplates.clear();

    if (!existsSync(dir)) {
      log.warn("Templates directory does not exist", { dir });
      return;
    }

    const entries = readdirSync(dir).filter((entry) =>
      statSync(path.join(dir, entry)).isDirectory(),
    );
    // Letter catalog first: loadOne resolves cover-letter fallbacks through it.
    for (const entry of entries) this.loadLetterTemplate(entry, path.join(dir, entry));
    for (const entry of entries) this.loadOne(entry, path.join(dir, entry));

    if (!this.letterTemplates.has(DEFAULT_LETTER_TEMPLATE_ID)) {
      log.warn("Default cover-letter template not found — templates without their own letter cannot render one", {
        id: DEFAULT_LETTER_TEMPLATE_ID,
      });
    }
    log.info("Template registry loaded", {
      count: this.templates.size,
      templates: [...this.templates.keys()],
      letterTemplates: [...this.letterTemplates.keys()],
    });
  }

  /**
   * Register a directory's cover-letter.typ as a selectable letter design.
   * Name/description come from config.json when present (read leniently:
   * letter-only dirs are not full templates and skip strict validation).
   */
  private loadLetterTemplate(id: string, tplDir: string): void {
    const p = path.join(tplDir, "cover-letter.typ");
    if (!existsSync(p)) return;
    let name = id;
    let description = "";
    try {
      const cfg = readJson(path.join(tplDir, "config.json")) as Record<string, unknown>;
      if (typeof cfg.name === "string") name = cfg.name;
      if (typeof cfg.description === "string") description = cfg.description;
    } catch {
      // No or invalid config.json — the id is a good enough display name.
    }
    this.letterTemplates.set(id, { id, source: readFileSync(p, "utf8"), name, description });
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
      const coverLetterSource = (
        this.letterTemplates.get(id) ?? this.letterTemplates.get(DEFAULT_LETTER_TEMPLATE_ID)
      )?.source;

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

  getLetterTemplate(id: string): LetterTemplate | undefined {
    return this.letterTemplates.get(id);
  }

  hasLetterTemplate(id: string): boolean {
    return this.letterTemplates.has(id);
  }

  /** Selectable letter designs for pickers, default first then alphabetical. */
  letterTemplateSummaries(): Array<{ id: string; name: string; description: string; default: boolean }> {
    return [...this.letterTemplates.values()]
      .map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        default: t.id === DEFAULT_LETTER_TEMPLATE_ID,
      }))
      .sort((a, b) => Number(b.default) - Number(a.default) || a.id.localeCompare(b.id));
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
