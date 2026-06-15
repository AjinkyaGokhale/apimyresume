# Hero marquee images

The landing-page hero shows a smooth, continuously scrolling strip of resume
thumbnails. Put the images it uses here.

Currently every card points at `temp.webp`. To use real resumes, replace it (or
add files and update the `src`s) in the `.mq-track` list in `index.html`:

```html
<div class="mq-card"><img src="resumes/temp.webp" alt="" /></div>
```

- **Format:** WebP / PNG / JPG.
- **Aspect ratio:** A4 portrait — **1 : 1.414** (e.g. 800 × 1131). Cards crop with
  `object-fit: cover` from the top, so keep the page top-aligned.
- **Count:** Add or remove `<div class="mq-card">` entries to taste — the strip is
  cloned once at runtime so the loop stays seamless regardless of count.
- **Speed:** controlled by the `mq-scroll` animation duration in the CSS
  (`.mq-track { animation: mq-scroll 24s ... }`) — lower = faster.
