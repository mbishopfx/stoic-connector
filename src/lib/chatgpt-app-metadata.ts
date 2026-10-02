// Version the UI resource URI so ChatGPT refreshes the updated embedded interface.
export const STOIC_DASHBOARD_RESOURCE_URI = "ui://stoic/dashboard-v2.html";

export function stoicDashboardResourceMetadata(origin: string, supabaseUrl?: string) {
  const widgetOrigin = new URL(origin).origin;
  const storageOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  const connectDomains = [...new Set([widgetOrigin, storageOrigin].filter((value): value is string => Boolean(value)))];

  return {
    ui: {
      domain: widgetOrigin,
      prefersBorder: true,
      permissions: { microphone: {} },
      csp: {
        connectDomains,
        resourceDomains: [widgetOrigin],
      },
    },
    "openai/ui": {
      availableDisplayModes: ["inline", "fullscreen"],
    },
    "openai/widgetDescription": "Stoic gives the agents you already use one calm place for project context and handoffs. Describe an outcome in chat, attach project files, review a proposed handoff, and add it to the shared queue. Workers see it on their next successful inbox check.",
  };
}

export const stoicDashboardToolMetadata = {
  ui: { resourceUri: STOIC_DASHBOARD_RESOURCE_URI },
  "openai/ui": {
    entrypoints: [{ type: "global" }, { type: "thread" }],
  },
} as const;
