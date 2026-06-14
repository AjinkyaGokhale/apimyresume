# APIMyResume — landing page

A single, self-contained static landing page for **apimyresume.com**. No build
step, no framework — just `index.html` plus two assets.

```
landing/
├── index.html              # the page (all CSS inline)
├── logo-apimyresume.png    # wordmark
├── embolism-spark.ttf      # (optional) display font, currently unused by the page
└── favicon/                # favicon set (.ico, .svg, PNGs, webmanifest)
```

The web manifest references icons with absolute `/favicon/...` paths, so the
site is expected to be hosted at the domain root (e.g. `apimyresume.com`).

Fonts (Figtree, JetBrains Mono) load from Google Fonts; everything else is local,
so the page works anywhere you drop these files.

## Host on AWS S3

1. **Create a bucket** named after your domain, e.g. `apimyresume.com`.

2. **Upload the files** (keep them at the bucket root):

   ```bash
   aws s3 sync landing/ s3://apimyresume.com/ --delete \
     --exclude "README.md"
   ```

3. **Enable static website hosting** on the bucket and set the index document to
   `index.html`:

   ```bash
   aws s3 website s3://apimyresume.com/ --index-document index.html
   ```

4. **Make the objects public.** Disable "Block all public access" on the bucket,
   then attach this bucket policy (replace the bucket name):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PublicReadGetObject",
       "Effect": "Allow",
       "Principal": "*",
       "Action": "s3:GetObject",
       "Resource": "arn:aws:s3:::apimyresume.com/*"
     }]
   }
   ```

The site is now live at the S3 website endpoint
(`http://apimyresume.com.s3-website-<region>.amazonaws.com`).

## Custom domain + HTTPS (recommended)

S3 website endpoints are HTTP-only. To serve `https://apimyresume.com`:

1. Put **CloudFront** in front of the bucket.
2. Request a certificate for `apimyresume.com` in **ACM** (region `us-east-1`).
3. Point your domain's DNS (Route 53 alias or a CNAME) at the CloudFront
   distribution.

After updating files, invalidate the CloudFront cache:

```bash
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

## Edit

Everything lives in `index.html` — copy, colors, and layout. Update the GitHub
links (currently `https://github.com/AjinkyaGokhale/apimyresume`) if the repo
moves.
