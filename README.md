# Stickify

Turn a GIF, a video, or the media in an X (Twitter) post into a **WhatsApp-ready sticker**.

Paste a link or upload a file, and Stickify returns a 512×512 WebP with a transparent border, automatically compressed to fit WhatsApp's limits (500 KB animated, 100 KB still).

**Try it:** [stickify-wa.netlify.app](https://stickify-wa.netlify.app) · [ogunleye-similoluwa.github.io/stickify](https://ogunleye-similoluwa.github.io/stickify/)

- **Frontend:** React and TypeScript (Vite), deployed on GitHub Pages and Netlify
- **Backend:** Java 21 + Spring Boot (MVC), using ffmpeg for conversion, deployed on Render with Docker

## How it works

Stickers are made **in the browser** with ffmpeg compiled to WebAssembly, using the same recipe as the server
(one resize pass to 512×512, then WebP quality steps until the file fits WhatsApp's limits). X posts are looked up
directly through the public fxtwitter API. The converter (~30 MB) is downloaded once and cached.

The Spring Boot API does the same work as a fallback for browsers that can't run the converter:

```
Browser ──► POST /api/stickers            (upload)
        └─► POST /api/stickers/from-link  (X post link)
                     │
             StickerController
                     │
              StickerService ── XMediaResolver ──► public embed API ──► video.twimg.com
                     │
              FfmpegConverter ──► ffmpeg ──► sticker.webp (512×512, ≤ 500 KB)
```

1. **Link resolving:** the post ID is extracted from the URL and looked up through a public embed API to find the attached GIF, video or photo. Media is only downloaded from X's own `twimg.com` hosts.
2. **Conversion:** ffmpeg scales the media to 512×512 (cropping to fill, or padding with transparency to show the whole picture) and encodes WebP. If the result is over WhatsApp's limit, it retries with a lower quality and frame rate until it fits.
3. **Response:** the sticker comes back as `image/webp`, with headers describing the result.

## Project structure

```
backend/                     Spring Boot API
  src/main/java/com/stickify/
    controller/              HTTP layer: request mapping, response shaping
    service/                 Business logic: link resolving, ffmpeg conversion, job limits
    model/                   Request, option and result types
    config/                  Typed configuration, CORS, interceptors
    exception/               Error types and the global error handler
    web/                     Rate limiting
  Dockerfile                 JRE + ffmpeg image
frontend/                    React + TypeScript app (Vite)
render.yaml                  Render blueprint for the API
```

The backend follows an MVC layering: **controllers** handle HTTP only, **services** hold the logic, and **models** are immutable records. The frontend is the view.

## API

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `GET` | `/api/health` | none | `{"status":"ok"}` |
| `POST` | `/api/stickers` | multipart: `file`, optional `mode` (`animated`/`static`), `seconds` (1–10), `start` | `image/webp` |
| `POST` | `/api/stickers/from-link` | JSON: `{"url": "...", "mode": "animated", "seconds": 6, "startSeconds": 0}` | `image/webp` |

Errors return JSON: `{"status": 422, "error": "...", "message": "That post has no GIF, video or photo to use."}`

Response headers: `X-Sticker-Mode`, `X-Sticker-Bytes`, `X-Sticker-Quality`.

## Run locally

Requirements: Java 21, Maven, ffmpeg.

```bash
cd backend
mvn spring-boot:run          # API on http://localhost:8080
```

In another terminal:

```bash
cd frontend
npm install
npm run dev                  # open the address it prints
```

When opened on `localhost`, the frontend talks to `http://localhost:8080` automatically. Add `?api=https://...` to the page address to point it at another server.

Or with Docker:

```bash
docker build -t stickify-api backend
docker run -p 8080:8080 stickify-api
```

## Deploy

**Backend (Render)**
1. In Render, choose **New → Blueprint** and select this repository. It reads `render.yaml`.
2. Set `ALLOWED_ORIGINS` in `render.yaml` to the addresses of your sites, separated by commas.

**Frontend (GitHub Pages)**
1. In the repository, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Under **Settings → Secrets and variables → Actions → Variables**, add `API_BASE_URL` with your Render URL.
3. Push to `main`, or run the **Deploy frontend** workflow.

**Frontend (Netlify)**
1. In Netlify, choose **Add new site → Import an existing project** and pick this repository. It reads `netlify.toml`.
2. Optionally set `VITE_API_BASE` under **Site configuration → Environment variables**.

Without `VITE_API_BASE`, the site uses `https://stickify-api.onrender.com`.

On Render's free plan the API sleeps when idle, so the first request after a while takes up to a minute. The page shows a notice while it wakes up. To keep it awake, point an uptime monitor such as UptimeRobot at `/api/health` every 5 minutes.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `*` | Comma-separated sites allowed to call the API |
| `MAX_CONCURRENT_JOBS` | `2` | ffmpeg processes allowed at once |
| `RATE_LIMIT_REQUESTS` | `30` | Requests per client every 10 minutes |
| `FFMPEG_PATH` | `ffmpeg` | Path to the ffmpeg binary |

## Getting stickers into WhatsApp

Websites can't add sticker packs to WhatsApp directly, since only phone apps can. The simplest route:

1. Drag the downloaded `.webp` into a chat on WhatsApp Web or Desktop. It sends as a sticker.
2. On your phone, tap the sticker and choose **Add to Favorites**.

## Fair use

Only convert media you have the right to use. Files are processed in a temporary folder and deleted immediately after conversion; nothing is stored.

## Contributing

Contributions are welcome. Every change goes through a pull request and is merged only after the maintainer approves it. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE). Copyright 2026 Similoluwa Ogunleye.
