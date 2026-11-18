import { describe, expect, it } from "vitest";
import { chooseMedia, smallestUsefulVariant, statusId } from "./x";

describe("statusId", () => {
  it("reads the post id from common link shapes", () => {
    expect(statusId("https://x.com/a/status/123?s=20")).toBe("123");
    expect(statusId("https://twitter.com/a/statuses/456")).toBe("456");
    expect(statusId("https://x.com/a")).toBeNull();
  });
});

describe("smallestUsefulVariant", () => {
  const variants = [
    { content_type: "application/x-mpegURL", url: "https://video.twimg.com/pl/a.m3u8" },
    { content_type: "video/mp4", url: "https://video.twimg.com/vid/480x270/a.mp4" },
    { content_type: "video/mp4", url: "https://video.twimg.com/vid/1280x720/b.mp4" },
    { content_type: "video/mp4", url: "https://video.twimg.com/vid/640x360/c.mp4?tag=14" },
  ];
  it("picks the smallest copy that fills a sticker", () => {
    expect(smallestUsefulVariant(variants)?.url).toBe("https://video.twimg.com/vid/640x360/c.mp4?tag=14");
  });
  it("falls back to the largest when all are small", () => {
    expect(smallestUsefulVariant(variants.slice(0, 2))?.url).toBe("https://video.twimg.com/vid/480x270/a.mp4");
    expect(smallestUsefulVariant([])).toBeNull();
  });
});

describe("chooseMedia", () => {
  it("prefers a GIF, then a video, then a photo", () => {
    const media = {
      photos: [{ url: "https://pbs.twimg.com/p.jpg" }],
      videos: [
        { type: "video", url: "https://video.twimg.com/v.mp4", duration: 7 },
        { type: "gif", url: "https://video.twimg.com/g.mp4", duration: 2.5 },
      ],
    };
    expect(chooseMedia(media)).toMatchObject({ kind: "gif", mediaUrl: "https://video.twimg.com/g.mp4", durationSeconds: 2.5 });
    expect(chooseMedia({ photos: media.photos })).toMatchObject({ kind: "photo" });
    expect(chooseMedia({})).toBeNull();
  });
});
