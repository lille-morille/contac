import { describe, expect, it } from "vitest";
import { ApiError } from "./api.ts";
import {
  guideAfterDelete,
  guideChanges,
  incomingGuideAction,
  isRetryableSaveError,
  moveId,
  saveRetryDelay,
} from "./call-guide-sync.ts";

const base = { revision: 3, title: "Leverandører", body: "# Hei" };

describe("call guide autosave", () => {
  it("sends only the fields that changed", () => {
    expect(guideChanges(base, { title: base.title, body: base.body })).toBeNull();
    expect(guideChanges(base, { title: "Kunder", body: base.body })).toEqual({ title: "Kunder" });
    expect(guideChanges(base, { title: base.title, body: "# Hallo" })).toEqual({
      body: "# Hallo",
    });
  });

  it("ignores the refetch caused by its own save and reorders", () => {
    expect(incomingGuideAction(base, { revision: 4 }, { saving: true, dirty: true })).toBe(
      "ignore",
    );
    expect(incomingGuideAction(base, { revision: 3 }, { saving: false, dirty: true })).toBe(
      "ignore",
    );
    expect(incomingGuideAction(base, { revision: 2 }, { saving: false, dirty: false })).toBe(
      "ignore",
    );
  });

  it("shows a teammate's newer version unless unsaved edits will meet it as a conflict", () => {
    expect(incomingGuideAction(base, { revision: 4 }, { saving: false, dirty: false })).toBe(
      "apply",
    );
    expect(incomingGuideAction(base, { revision: 4 }, { saving: false, dirty: true })).toBe("keep");
  });

  it("retries network and server failures, not rejected input", () => {
    expect(isRetryableSaveError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableSaveError(new ApiError("x", 503, {}))).toBe(true);
    expect(isRetryableSaveError(new ApiError("x", 400, {}))).toBe(false);
    expect(isRetryableSaveError(new ApiError("x", 404, {}))).toBe(false);
    expect([1, 2, 3, 10].map(saveRetryDelay)).toEqual([2000, 4000, 8000, 30000]);
  });
});

describe("call guide list", () => {
  it("moves a guide one step with the keyboard", () => {
    expect(moveId(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b", "c"], "a", 1)).toEqual(["b", "a", "c"]);
    const ids = ["a", "b"];
    expect(moveId(ids, "a", -1)).toBe(ids);
  });

  it("selects the next guide after deleting, else the previous", () => {
    expect(guideAfterDelete(["a", "b", "c"], "b")).toBe("c");
    expect(guideAfterDelete(["a", "b", "c"], "c")).toBe("b");
    expect(guideAfterDelete(["a"], "a")).toBeNull();
  });
});
