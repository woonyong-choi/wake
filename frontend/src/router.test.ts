import { describe, expect, it } from "vitest";
import { resolveRoute } from "./router";

describe("resolveRoute", () => {
  it("keeps the portfolio entry point at the root", () => {
    expect(resolveRoute("/")).toEqual({ kind: "overview" });
  });

  it("resolves a correlation-scoped incident", () => {
    expect(resolveRoute("/incidents/rca%2F123/")).toEqual({
      kind: "incident",
      correlationId: "rca/123",
    });
  });

  it("fails closed for removed product paths", () => {
    expect(resolveRoute("/terminal")).toEqual({ kind: "not-found" });
    expect(resolveRoute("/dashboard")).toEqual({ kind: "not-found" });
  });
});
