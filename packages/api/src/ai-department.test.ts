import { describe, expect, it } from "vitest";
import { resolveDepartmentProposal } from "./ai-department.ts";

const departments = [
  { id: "ops", companyId: "company-a", name: "Drift og teknologi" },
  { id: "other", companyId: "company-b", name: "Salg" },
];

describe("resolveDepartmentProposal", () => {
  it("uses an existing department when the name matches", () => {
    expect(
      resolveDepartmentProposal(null, "  DRIFT og teknologi ", "company-a", null, departments),
    ).toEqual({
      departmentId: "ops",
      departmentName: null,
    });
  });

  it("does not accept a department from another company", () => {
    expect(resolveDepartmentProposal("other", null, "company-a", null, departments)).toEqual({
      departmentId: null,
      departmentName: null,
    });
  });

  it("keeps a genuinely new named department for creation", () => {
    expect(
      resolveDepartmentProposal(null, "Produktutvikling", "company-a", null, departments),
    ).toEqual({
      departmentId: null,
      departmentName: "Produktutvikling",
    });
  });

  it("drops a proposal that matches the current department", () => {
    expect(resolveDepartmentProposal("ops", null, "company-a", "ops", departments)).toEqual({
      departmentId: null,
      departmentName: null,
    });
  });
});
