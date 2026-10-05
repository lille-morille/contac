import { describe, expect, it } from "vitest";
import { findPhoneMatch, matchesPaletteItem } from "./command-palette.tsx";

describe("command palette phone search", () => {
  const contact = {
    title: "Ola Nordmann",
    detail: "Nord AS",
    searchText: "telefon tlf",
    phone: "+47 936 68 953",
  };

  it("matches partial digits across formatting and ignores surrounding spaces", () => {
    expect(matchesPaletteItem(contact, "  36 68  ")).toBe(true);
    expect(matchesPaletteItem(contact, "936-68")).toBe(true);
    expect(matchesPaletteItem(contact, "Ola 68 953")).toBe(true);
    expect(matchesPaletteItem(contact, "Nord 68 953")).toBe(true);
    expect(matchesPaletteItem(contact, "68 954")).toBe(false);
  });

  it("returns the matched portion of the displayed phone number", () => {
    const range = findPhoneMatch(contact.phone, "  36 68  ");
    expect(range && contact.phone.slice(...range)).toBe("36 68");
    expect(findPhoneMatch(contact.phone, "68 954")).toBeNull();
  });
});
