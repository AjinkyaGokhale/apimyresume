# Hero carousel images

Drop the resume thumbnails the landing-page hero coverflow uses here:

```
resume-1.png
resume-2.png
resume-3.png
resume-4.png
resume-5.png
resume-6.png
```

- **Format:** PNG (or swap the extension in `index.html`; JPG/WebP work too).
- **Aspect ratio:** A4 portrait — **1 : 1.414** (e.g. 800 × 1131). The card crops to
  `object-fit: cover` from the top, so keep the page top-aligned.
- **Count:** 6 is the default. To use more/fewer, add or remove `<li class="cf-item">`
  entries in the `.cf-stage` list in `index.html` — the script adapts automatically.
  (6+ gives the smoothest infinite rotation; the far cards wrap off-screen.)

Until real images are added, each card shows a small filename placeholder so the
layout still reads correctly.
