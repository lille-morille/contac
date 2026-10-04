import { describe, expect, it } from "vitest";
import { resolveDomainProposal } from "./ai-domain.ts";

describe("resolveDomainProposal", () => {
  const domains = [{ id: "mining", normalizedName: "gruvedrift" }];

  it("reuses an existing domain regardless of letter case or surrounding spaces", () => {
    expect(resolveDomainProposal("  GRUVEDRIFT  ", domains)).toEqual({
      domainId: "mining",
      newDomainName: null,
    });
  });

  it("offers a novel domain for creation", () => {
    expect(resolveDomainProposal("Avfallshåndtering", domains)).toEqual({
      domainId: null,
      newDomainName: "Avfallshåndtering",
    });
  });
});
