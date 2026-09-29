import { describe, expect, it, vi } from "vitest";
import { getFileUploadIdempotencyKey } from "../src/lib/intake-upload";

describe("intake upload retry keys", () => {
  it("reuses one idempotency key for the same selected file across retries", () => {
    const keys = new WeakMap<object, string>();
    const file = {};
    const createKey = vi.fn(() => "file-upload-key-1");

    expect(getFileUploadIdempotencyKey(keys, file, createKey)).toBe("file-upload-key-1");
    expect(getFileUploadIdempotencyKey(keys, file, createKey)).toBe("file-upload-key-1");
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("keeps different selected files distinct", () => {
    const keys = new WeakMap<object, string>();
    const createKey = vi.fn().mockReturnValueOnce("file-upload-key-1").mockReturnValueOnce("file-upload-key-2");

    expect(getFileUploadIdempotencyKey(keys, {}, createKey)).toBe("file-upload-key-1");
    expect(getFileUploadIdempotencyKey(keys, {}, createKey)).toBe("file-upload-key-2");
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});
