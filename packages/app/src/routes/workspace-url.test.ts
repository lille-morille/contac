import { describe, expect, it } from "vitest";
import { readWorkspaceLocation, workspaceSearch } from "./index.tsx";

describe("workspace links", () => {
  it("round trips team, board filters, organization focus, and a highlighted contact passage", () => {
    const original =
      "?team=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&page=organizations" +
      "&contact=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" +
      "&activity=cccccccc-cccc-4ccc-8ccc-cccccccccccc" +
      "&passage=et+funn&q=kostnad" +
      "&mapDomain=dddddddd-dddd-4ddd-8ddd-dddddddddddd" +
      "&layout=list&sort=name&status=follow_up&status=skal_ringe" +
      "&assignee=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const first = readWorkspaceLocation(original);
    const restored = readWorkspaceLocation(workspaceSearch(first));
    expect(restored).toEqual(first);
    expect(restored.view.filters.status).toEqual(["follow_up", "skal_ringe"]);
    expect(restored.mapFocus).toEqual({
      kind: "domain",
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
  });

  it("restores feed and quote search state", () => {
    const feed = readWorkspaceLocation("?page=contacted&feedAssignee=all&feedQ=prosjekt&feedAll=1");
    expect(readWorkspaceLocation(workspaceSearch(feed)).feed).toEqual(feed.feed);
    const library = readWorkspaceLocation("?page=library&quoteQ=marked");
    expect(readWorkspaceLocation(workspaceSearch(library)).librarySearch).toBe("marked");
  });

  it("falls back from unknown pages and malformed contact or map IDs", () => {
    const location = readWorkspaceLocation("?page=missing&contact=nope&mapCompany=broken");
    expect(location.page).toBe("contacts");
    expect(location.contact).toBeNull();
    expect(location.mapFocus.kind).toBe("all");
  });
});
