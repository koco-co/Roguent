// B4 image-attachment helpers (web). Turns a browser File into the shared
// `ImageAttachment` content-block shape, validating media type + size before we
// ever hold the bytes in memory or hand them to the engine / SDK. Kept pure +
// FileReader-injectable so the validation rules are unit-testable without a DOM.
import {
  IMAGE_ATTACHMENT_MEDIA_TYPES,
  type ImageAttachment,
  type ImageAttachmentMediaType,
} from "../../shared/commands";

export {
  IMAGE_ATTACHMENT_MEDIA_TYPES,
  MAX_IMAGE_ATTACHMENTS,
} from "../../shared/commands";

/** Reject anything bigger than ~4MB (raw file bytes, pre-base64). */
export const MAX_IMAGE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export type AttachmentRejectReason = "type" | "size" | "count" | "read";

export type ReadAttachmentResult =
  | { ok: true; attachment: ImageAttachment }
  | { ok: false; reason: AttachmentRejectReason; name: string };

export function isAllowedImageType(
  mediaType: string,
): mediaType is ImageAttachmentMediaType {
  return (IMAGE_ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(
    mediaType,
  );
}

/**
 * Strip the `data:<mime>;base64,` prefix from a FileReader data URL, leaving
 * RAW base64 (what the SDK `ImageBlockParam` base64 source expects).
 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Build a safe `data:` URL for inline <img> preview from a validated attachment. */
export function attachmentDataUrl(att: {
  mediaType: string;
  dataBase64: string;
}): string {
  return `data:${att.mediaType};base64,${att.dataBase64}`;
}

type FileLike = {
  name: string;
  type: string;
  size: number;
};

// Minimal FileReader surface we depend on; injectable so tests don't need a DOM.
type ReaderLike = {
  readAsDataURL(file: Blob): void;
  result: string | ArrayBuffer | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
};

type ReaderFactory = () => ReaderLike;

const defaultReaderFactory: ReaderFactory = () =>
  new FileReader() as unknown as ReaderLike;

/**
 * Read + validate a single File into an `ImageAttachment`. Validates media type
 * (4 allowed) and size (<= ~4MB) BEFORE decoding. Never throws — returns a
 * tagged result so the caller can surface a hint per file.
 */
export function readImageAttachment(
  file: FileLike & Blob,
  readerFactory: ReaderFactory = defaultReaderFactory,
): Promise<ReadAttachmentResult> {
  if (!isAllowedImageType(file.type)) {
    return Promise.resolve({ ok: false, reason: "type", name: file.name });
  }
  if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
    return Promise.resolve({ ok: false, reason: "size", name: file.name });
  }
  const mediaType = file.type;
  return new Promise<ReadAttachmentResult>((resolve) => {
    const reader = readerFactory();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        resolve({ ok: false, reason: "read", name: file.name });
        return;
      }
      resolve({
        ok: true,
        attachment: {
          kind: "image",
          name: file.name,
          mediaType,
          dataBase64: stripDataUrlPrefix(result),
        },
      });
    };
    reader.onerror = () => {
      resolve({ ok: false, reason: "read", name: file.name });
    };
    reader.readAsDataURL(file);
  });
}
