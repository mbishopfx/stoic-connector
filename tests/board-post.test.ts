import { describe, expect, it } from "vitest";
import { boardPostInput } from "../src/lib/board";

const projectId = "50000000-0000-4000-8000-000000000001";
const parentId = "50000000-0000-4000-8000-000000000002";
const validMessage = { projectId, body: "A useful thought", idempotencyKey: "board-post-123" };

describe("board post input", () => {
  it("allows owner review suggestions as top-level posts", () => {
    const parsed = boardPostInput.parse({ ...validMessage, kind: "suggestion" });
    expect(parsed.kind).toBe("suggestion");
    expect(parsed.parentId).toBeUndefined();
  });

  it("keeps suggestions out of reply threads", () => {
    const result = boardPostInput.safeParse({ ...validMessage, kind: "suggestion", parentId });
    expect(result.success).toBe(false);
  });
});
