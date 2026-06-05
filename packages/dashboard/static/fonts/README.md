# Self-hosted fonts

The `APIMyResume` wordmark uses **Embolism Spark Regular**, which is not a Google
Font, so it must be self-hosted here.

Drop the font file at one of:

- `embolism-spark.woff2`  (preferred — smallest)
- `embolism-spark.ttf`    (fallback)

These are referenced by the `@font-face` rule in `src/app.css`. Files in
`static/` are served from the site root, so `static/fonts/embolism-spark.woff2`
loads at `/fonts/embolism-spark.woff2`.

Until a file is present, the wordmark falls back to **Acme**.

Tip: if you only have a `.ttf`/`.otf`, convert to `.woff2` (e.g. with
`fonttools`: `pip install fonttools brotli` then
`fonttools ttLib EmbolismSpark.ttf --flavor woff2 -o embolism-spark.woff2`).
