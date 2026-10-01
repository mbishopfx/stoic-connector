import { describe, expect, it } from "vitest";
import {
  STOIC_DASHBOARD_RESOURCE_URI,
  stoicDashboardResourceMetadata,
  stoicDashboardToolMetadata,
} from "../src/lib/chatgpt-app-metadata";

describe("Stoic ChatGPT app metadata", () => {
  it("registers the workspace for the global sidebar and conversation panel", () => {
    expect(stoicDashboardToolMetadata).toEqual({
      ui: { resourceUri: STOIC_DASHBOARD_RESOURCE_URI },
      "openai/ui": {
        entrypoints: [{ type: "global" }, { type: "thread" }],
      },
    });
  });

  it("declares only the widget and configured Supabase origins and enables voice recording on request", () => {
    expect(stoicDashboardResourceMetadata("https://stoic.bishoptech.dev/path", "https://stoic-project.supabase.co")).toEqual({
      ui: {
        domain: "https://stoic.bishoptech.dev",
        prefersBorder: true,
        permissions: { microphone: {} },
        csp: {
          connectDomains: ["https://stoic.bishoptech.dev", "https://stoic-project.supabase.co"],
          resourceDomains: ["https://stoic.bishoptech.dev"],
        },
      },
      "openai/ui": { availableDisplayModes: ["inline", "fullscreen"] },
      "openai/widgetDescription": expect.stringContaining("Stoic gives the agents you already use"),
    });
  });

  it("deduplicates a same-origin upload destination", () => {
    expect(stoicDashboardResourceMetadata("https://stoic.bishoptech.dev", "https://stoic.bishoptech.dev/storage").ui.csp.connectDomains)
      .toEqual(["https://stoic.bishoptech.dev"]);
  });
});
