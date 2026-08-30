import assert from "node:assert/strict";
import test from "node:test";

test("ticket image key stays inside the authenticated user's folder", async () => {
  const media = await import("./ticket-image").catch(() => ({}));
  assert.equal(typeof media.buildTicketImageKey, "function");
  assert.equal(
    media.buildTicketImageKey?.("user-1", "PNG", "random-1"),
    "ticket-images/user-1/random-1.png",
  );
});

test("ticket image request rejects unsupported or oversized files", async () => {
  const media = await import("./ticket-image").catch(() => ({}));
  assert.equal(typeof media.validateTicketImageRequest, "function");
  assert.equal(media.validateTicketImageRequest?.("gif", "image/gif", 100), "Unsupported image type");
  assert.equal(media.validateTicketImageRequest?.("jpg", "image/jpeg", 5 * 1024 * 1024 + 1), "Image too large");
  assert.equal(media.validateTicketImageRequest?.("webp", "image/webp", 5 * 1024 * 1024), null);
});
