import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (tailwind class merge)", () => {
  it("joins truthy classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });
  it("filters falsy values", () => {
    const falsy: false | string = false;
    expect(cn("a", falsy && "b", null, undefined, "c")).toBe("a c");
  });
  it("later tailwind class wins on conflict", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
