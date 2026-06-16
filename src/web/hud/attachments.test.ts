import { expect, test } from "bun:test";
import {
  MAX_IMAGE_ATTACHMENT_BYTES,
  attachmentDataUrl,
  isAllowedImageType,
  readImageAttachment,
  stripDataUrlPrefix,
} from "./attachments";

// A FileReader stand-in that synchronously yields a fixed data URL on read.
function fakeReader(dataUrl: string, fail = false) {
  return () => {
    const reader = {
      result: null as string | ArrayBuffer | null,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      readAsDataURL() {
        if (fail) {
          reader.onerror?.();
          return;
        }
        reader.result = dataUrl;
        reader.onload?.();
      },
    };
    return reader;
  };
}

function fakeFile(opts: {
  name?: string;
  type: string;
  size: number;
}): File & { name: string; type: string; size: number } {
  return {
    name: opts.name ?? "pic.png",
    type: opts.type,
    size: opts.size,
  } as unknown as File & { name: string; type: string; size: number };
}

test("isAllowedImageType accepts the 4 image types and rejects others", () => {
  expect(isAllowedImageType("image/png")).toBe(true);
  expect(isAllowedImageType("image/jpeg")).toBe(true);
  expect(isAllowedImageType("image/gif")).toBe(true);
  expect(isAllowedImageType("image/webp")).toBe(true);
  expect(isAllowedImageType("image/svg+xml")).toBe(false);
  expect(isAllowedImageType("application/pdf")).toBe(false);
  expect(isAllowedImageType("text/html")).toBe(false);
});

test("stripDataUrlPrefix returns raw base64 with no data: prefix", () => {
  expect(stripDataUrlPrefix("data:image/png;base64,QUJD")).toBe("QUJD");
  // already-raw input passes through unchanged
  expect(stripDataUrlPrefix("QUJD")).toBe("QUJD");
});

test("attachmentDataUrl rebuilds a safe data: URL for inline preview", () => {
  expect(
    attachmentDataUrl({ mediaType: "image/png", dataBase64: "QUJD" }),
  ).toBe("data:image/png;base64,QUJD");
});

test("readImageAttachment reads an allowed file into an ImageAttachment", async () => {
  const file = fakeFile({ name: "a.png", type: "image/png", size: 100 });
  const result = await readImageAttachment(
    file,
    fakeReader("data:image/png;base64,QUJD"),
  );
  expect(result).toEqual({
    ok: true,
    attachment: {
      kind: "image",
      name: "a.png",
      mediaType: "image/png",
      dataBase64: "QUJD",
    },
  });
});

test("readImageAttachment rejects a non-image type without reading", async () => {
  const file = fakeFile({ name: "x.pdf", type: "application/pdf", size: 10 });
  const result = await readImageAttachment(
    file,
    fakeReader("data:application/pdf;base64,QUJD"),
  );
  expect(result).toEqual({ ok: false, reason: "type", name: "x.pdf" });
});

test("readImageAttachment rejects oversize files without reading", async () => {
  const file = fakeFile({
    name: "big.png",
    type: "image/png",
    size: MAX_IMAGE_ATTACHMENT_BYTES + 1,
  });
  const result = await readImageAttachment(
    file,
    fakeReader("data:image/png;base64,QUJD"),
  );
  expect(result).toEqual({ ok: false, reason: "size", name: "big.png" });
});

test("readImageAttachment surfaces a read failure", async () => {
  const file = fakeFile({ name: "a.png", type: "image/png", size: 100 });
  const result = await readImageAttachment(file, fakeReader("", true));
  expect(result).toEqual({ ok: false, reason: "read", name: "a.png" });
});
