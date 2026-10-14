"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { RotateCcwIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STORAGE_KEY = "stoic-appearance";

export const DEFAULT_APPEARANCE = {
  accent: "forest",
  density: "comfortable",
  corners: "soft",
} as const;

export type DashboardAppearancePreferences = {
  accent: "forest" | "slate" | "ocean" | "clay";
  density: "comfortable" | "compact";
  corners: "soft" | "crisp";
};

function isAppearance(value: unknown): value is DashboardAppearancePreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["forest", "slate", "ocean", "clay"].includes(String(candidate.accent))
    && ["comfortable", "compact"].includes(String(candidate.density))
    && ["soft", "crisp"].includes(String(candidate.corners));
}

export function useDashboardAppearance() {
  const [appearance, setAppearance] = useState<DashboardAppearancePreferences>(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isAppearance(parsed)) setAppearance(parsed);
      }
    } catch {
      // Ignore blocked storage or old malformed preferences and keep the defaults.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // Appearance still works for this page when storage is unavailable.
    }
  }, [appearance, ready]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (isAppearance(parsed)) setAppearance(parsed);
      } catch {
        // Ignore invalid cross-tab values.
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return { appearance, setAppearance };
}

export function DashboardAppearanceControl({
  appearance,
  onChange,
}: {
  appearance: DashboardAppearancePreferences;
  onChange: (value: DashboardAppearancePreferences) => void;
}) {
  const { theme, setTheme } = useTheme();

  function update<K extends keyof DashboardAppearancePreferences>(key: K, value: DashboardAppearancePreferences[K]) {
    onChange({ ...appearance, [key]: value });
  }

  function reset() {
    setTheme("system");
    onChange({ ...DEFAULT_APPEARANCE });
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Customize appearance" title="Appearance">
            <SlidersHorizontalIcon aria-hidden="true" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[calc(100vw-1rem)] max-w-80 p-4">
        <PopoverHeader className="gap-1">
          <PopoverTitle>Appearance</PopoverTitle>
          <PopoverDescription>Choose how your workspace looks on this browser.</PopoverDescription>
        </PopoverHeader>
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="appearance-theme">Theme</FieldLabel>
            <Select items={[{ value: "system", label: "Use device setting" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} value={theme || "system"} onValueChange={(value) => setTheme(value || "system")}>
              <SelectTrigger id="appearance-theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Use device setting</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="appearance-accent">Accent color</FieldLabel>
            <Select items={[{ value: "forest", label: "Forest" }, { value: "slate", label: "Slate" }, { value: "ocean", label: "Ocean" }, { value: "clay", label: "Clay" }]} value={appearance.accent} onValueChange={(value) => {
              if (value && ["forest", "slate", "ocean", "clay"].includes(value)) update("accent", value as DashboardAppearancePreferences["accent"]);
            }}>
              <SelectTrigger id="appearance-accent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="forest">Forest</SelectItem>
                <SelectItem value="slate">Slate</SelectItem>
                <SelectItem value="ocean">Ocean</SelectItem>
                <SelectItem value="clay">Clay</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="appearance-density">Spacing</FieldLabel>
            <Select items={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} value={appearance.density} onValueChange={(value) => {
              if (value === "comfortable" || value === "compact") update("density", value);
            }}>
              <SelectTrigger id="appearance-density" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>Compact spacing fits more content on screen.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="appearance-corners">Corners</FieldLabel>
            <Select items={[{ value: "soft", label: "Soft" }, { value: "crisp", label: "Crisp" }]} value={appearance.corners} onValueChange={(value) => {
              if (value === "soft" || value === "crisp") update("corners", value);
            }}>
              <SelectTrigger id="appearance-corners" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="soft">Soft</SelectItem>
                <SelectItem value="crisp">Crisp</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <div className="mt-1 flex justify-end border-t border-border pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcwIcon aria-hidden="true" />
            Reset appearance
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
