import { describe, expect, it, vi } from "vitest";
const { managedJsonMock } = vi.hoisted(() => ({ managedJsonMock: vi.fn() }));
vi.mock("@/lib/managed-codex", () => ({ runManagedCodexJson: managedJsonMock }));
import { mapContactCsvColumns, mapContactCsvRows, parseContactCsv, type ContactColumnMapping } from "../src/lib/contact-csv";

const mapping: ContactColumnMapping = {
  nameColumns: [0, 1],
  emailColumn: 2,
  phoneColumn: 3,
  companyColumn: 4,
  jobTitleColumn: null,
  sourceColumn: 5,
  sourceUrlColumn: 6,
  notesColumns: [7],
};

describe("workspace contact CSV", () => {
  it("parses quoted commas, embedded newlines, escaped quotes, and a UTF-8 BOM", () => {
    const parsed = parseContactCsv('\uFEFFFirst,Last,Email,Phone,Company,Source,URL,Notes\r\nAda,Lovelace,ada@example.com,555-1000,Analytical Engines,Conference,https://example.com/profile,"Met Grace, then said ""hello""\nFollow up"');
    expect(parsed.headers).toEqual(["First", "Last", "Email", "Phone", "Company", "Source", "URL", "Notes"]);
    expect(parsed.rows[0][7]).toBe('Met Grace, then said "hello"\nFollow up');
  });

  it("maps confirmed cells and source details without enriching data or trusting unsafe URLs", () => {
    const { headers, rows } = parseContactCsv("First,Last,Email,Phone,Company,Source,URL,Notes\nAda,Lovelace,ada@example.com,555-1000,Engines,Conference,javascript:alert(1),Interested in an archive");
    const contacts = mapContactCsvRows({ headers, rows, mapping, importId: "batch-1", fallbackSource: "Uploaded list" });
    expect(contacts[0]).toMatchObject({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "555-1000",
      company: "Engines",
      source_label: "Conference",
      source_url: null,
      notes: "Notes: Interested in an archive",
      source_key: "import:batch-1:row:2",
    });
    const urls = mapContactCsvRows({
      headers,
      rows: [["Ada", "Lovelace", "ada@example.com", "555-1000", "Engines", "Research", "https://example.com/profile?campaign=fall&access_token=private#section", ""]],
      mapping,
      importId: "batch-urls",
      fallbackSource: "Uploaded list",
    });
    expect(urls[0]?.source_url).toBe("https://example.com/profile?campaign=fall");
    const credentialUrl = mapContactCsvRows({
      headers,
      rows: [["Ada", "Lovelace", "ada@example.com", "555-1000", "Engines", "Research", "https://person:secret@example.com/profile", ""]],
      mapping,
      importId: "batch-credentials",
      fallbackSource: "Uploaded list",
    });
    expect(credentialUrl[0]?.source_url).toBeNull();
  });

  it("skips rows without a usable name and rejects malformed quoting", () => {
    const { headers, rows } = parseContactCsv("First,Last,Email\n,,unknown\nAda,Lovelace,ada@example.com");
    const contacts = mapContactCsvRows({
      headers,
      rows,
      mapping: { ...mapping, emailColumn: 2, phoneColumn: null, companyColumn: null, sourceColumn: null, sourceUrlColumn: null, notesColumns: [] },
      importId: "batch-2",
      fallbackSource: "Uploaded list",
    });
    expect(contacts).toHaveLength(2);
    expect(contacts[0]).toBeNull();
    expect(() => parseContactCsv('Name,Notes\nAda,"unfinished')).toThrow("unfinished quoted field");
  });

  it("sends column labels and value shapes to the managed mapper without contact row values", async () => {
    managedJsonMock.mockResolvedValue({ nameColumns: [0], emailColumn: 1, phoneColumn: 2, companyColumn: null, jobTitleColumn: null, sourceColumn: null, sourceUrlColumn: null, notesColumns: [] });
    await mapContactCsvColumns(["Name", "Email", "Phone"], [["Ada Lovelace", "ada@example.com", "555-010-1234"]]);
    const input = JSON.parse(managedJsonMock.mock.calls.at(-1)?.[0].userInput as string);
    expect(input).toEqual({ headers: ["Name", "Email", "Phone"], samplePatterns: [["multiword_text"], ["email_like"], ["phone_or_number_like"]] });
    expect(JSON.stringify(input)).not.toContain("Ada Lovelace");
    expect(JSON.stringify(input)).not.toContain("ada@example.com");
  });
});
