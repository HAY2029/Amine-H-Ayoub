import { describe, expect, it } from "vitest";
import { classifyAppError } from "./errorClassification";

describe("classifyAppError", () => {
  it("prioritizes the browser offline state", () => {
    expect(classifyAppError(new Error("Unexpected token"), false)).toBe("offline");
  });

  it("classifies known fetch failures as service/network errors", () => {
    expect(classifyAppError(new TypeError("Failed to fetch"), true)).toBe("service");
  });

  it("classifies server errors as service errors", () => {
    expect(classifyAppError({ status: 503 }, true)).toBe("service");
  });

  it("does not mistake application errors for internet failures", () => {
    expect(classifyAppError(new Error("Cannot read properties of undefined"), true)).toBe("application");
  });
});
