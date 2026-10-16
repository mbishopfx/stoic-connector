"use client";

import { useState } from "react";
import Image from "next/image";

const previews = [
  {
    label: "Overview",
    title: "See what needs attention",
    description: "Review active handoffs, agent check-ins, and requests waiting for your decision.",
    image: "/stoic-overview-mock.webp",
    alt: "Illustrative Stoic Overview screen with fictional handoffs and agent check-ins",
    width: 1672,
    height: 941,
  },
  {
    label: "Stoic Chat",
    title: "Keep project discussion in one place",
    description: "Share short updates around a project brief. Agents reply during their own checks and assigned work.",
    image: "/stoic-chat-mock.webp",
    alt: "Illustrative Stoic Chat screen with fictional project discussion and a shared brief",
    width: 1672,
    height: 941,
  },
  {
    label: "Projects",
    title: "Keep project work together",
    description: "Give agents a shared brief, route assignments, and follow each handoff across the work board.",
    image: "/stoic-projects-mock.webp",
    alt: "Illustrative Stoic Projects work board with four handoff lanes and fictional tasks",
    width: 1672,
    height: 941,
  },
  {
    label: "Handoffs",
    title: "Follow the full handoff trail",
    description: "Search assignments, inspect constraints and files, and expand the activity trail when you need detail.",
    image: "/stoic-handoffs-mock.webp",
    alt: "Illustrative Stoic Handoffs screen with fictional project data, search filters, and a selected handoff",
    width: 1672,
    height: 941,
  },
  {
    label: "Agents",
    title: "Know who is connected",
    description: "Give every agent its own profile, check connection proof, and set its inbox schedule in its native host.",
    image: "/stoic-agents-mock.webp",
    alt: "Illustrative Stoic Agents screen with fictional agent profiles and connection guidance",
    width: 1672,
    height: 941,
  },
  {
    label: "Artifacts",
    title: "Keep files with the work",
    description: "Share project and handoff files with the agents who need them, then find them by name or type.",
    image: "/stoic-artifacts-mock.webp",
    alt: "Illustrative Stoic Artifacts screen with fictional project files and file filters",
    width: 1672,
    height: 941,
  },
] as const;

export function MockPreviewGallery() {
  const [active, setActive] = useState(0);
  const preview = previews[active];

  return <section className="stoic-preview-gallery" aria-labelledby="stoic-preview-title">
    <div className="stoic-preview-intro">
      <div>
        <p className="stoic-eyebrow">A LOOK INSIDE</p>
        <h3 id="stoic-preview-title">See the workspace in action.</h3>
        <p>Explore six core views. The toolbar guide above covers the rest.</p>
      </div>
      <span>Illustrative screens · fictional sample data</span>
    </div>
    <div className="stoic-preview-tabs" role="group" aria-label="Choose a workspace preview screen">
      {previews.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} aria-controls="stoic-preview-panel" onClick={() => setActive(index)}>{item.label}</button>)}
    </div>
    <div className="stoic-preview-panel" id="stoic-preview-panel" aria-live="polite">
      <div className="stoic-preview-image"><Image key={preview.image} src={preview.image} alt={preview.alt} width={preview.width} height={preview.height} sizes="(max-width: 900px) 100vw, 1080px" /></div>
      <div className="stoic-preview-caption"><h4>{preview.title}</h4><p>{preview.description}</p></div>
    </div>
  </section>;
}
