import { z } from "zod";

export const CONTACT_STATUSES = ["new", "contacted", "qualified", "customer", "archived"] as const;
export const CONTACT_SEARCH_FIELDS = ["all", "name", "company", "email", "phone", "notes", "source"] as const;
export const CONTACTABILITY_FILTERS = ["any", "has_email", "missing_email", "has_phone", "missing_phone", "no_direct"] as const;
export const CONTACT_ACTIVITY_FILTERS = ["any", "7d", "30d", "90d"] as const;
export const CONTACT_SORT_OPTIONS = ["recent", "last_seen", "newest", "oldest", "name_asc", "name_desc"] as const;

export const contactSearchSchema = z.object({
  search: z.string().trim().max(120).default(""),
  field: z.enum(CONTACT_SEARCH_FIELDS).default("all"),
  status: z.enum(["all", ...CONTACT_STATUSES]).default("all"),
  projectId: z.union([z.uuid(), z.literal("all"), z.literal("unassigned")]).default("all"),
  contactability: z.enum(CONTACTABILITY_FILTERS).default("any"),
  activity: z.enum(CONTACT_ACTIVITY_FILTERS).default("any"),
  sort: z.enum(CONTACT_SORT_OPTIONS).default("recent"),
  offset: z.number().int().min(0).max(100_000).default(0),
});

export type ContactSearchInput = z.input<typeof contactSearchSchema>;
export type ContactSearchFilters = z.output<typeof contactSearchSchema>;

export const DEFAULT_CONTACT_FILTERS: ContactSearchFilters = {
  search: "", field: "all", status: "all", projectId: "all",
  contactability: "any", activity: "any", sort: "recent", offset: 0,
};

export function contactSearchParams(input: ContactSearchInput) {
  const filters = contactSearchSchema.parse(input);
  return new URLSearchParams({
    q: filters.search,
    field: filters.field,
    status: filters.status,
    projectId: filters.projectId,
    contactability: filters.contactability,
    activity: filters.activity,
    sort: filters.sort,
    offset: String(filters.offset),
  });
}

export function literalIlikePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export function recentContactCutoff(activity: ContactSearchFilters["activity"], now = Date.now()) {
  if (activity === "any") return null;
  const days = activity === "7d" ? 7 : activity === "30d" ? 30 : 90;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}
