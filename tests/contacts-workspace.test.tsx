import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContactsWorkspace } from "@/components/contacts-workspace";
import { contactSearchParams, DEFAULT_CONTACT_FILTERS } from "@/lib/contact-filters";

const projects = [{ id: "40000000-0000-4000-8000-000000000001", name: "First project" }];

describe("search-first Contacts workspace", () => {
  it("renders accessible, granular filters and keeps write forms secondary", () => {
    const html = renderToStaticMarkup(createElement(ContactsWorkspace, {
      projects, busy: false, command: async () => ({}), onOpenPrompts: () => {},
    }));
    for (const label of ["Search contacts", "Search in", "Status", "Project", "Contact details", "Last activity", "Sort by", "Add a contact", "Import CSV"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Clear filters");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("private");
  });

  it("serializes only validated filters and keeps paging stable", () => {
    const params = contactSearchParams({ ...DEFAULT_CONTACT_FILTERS, search: "  Ada@example.com ", field: "email", status: "new", projectId: projects[0].id,
      contactability: "missing_phone", activity: "30d", sort: "name_asc", offset: 50 });
    expect(params.get("q")).toBe("Ada@example.com");
    expect(params.get("field")).toBe("email");
    expect(params.get("status")).toBe("new");
    expect(params.get("projectId")).toBe(projects[0].id);
    expect(params.get("contactability")).toBe("missing_phone");
    expect(params.get("activity")).toBe("30d");
    expect(params.get("sort")).toBe("name_asc");
    expect(params.get("offset")).toBe("50");
  });
});
