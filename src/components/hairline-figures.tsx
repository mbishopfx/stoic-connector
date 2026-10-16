"use client";

import { Branches, Vault, Relay, Phosphor } from "@lucasmarkes/hairline/react";

const figures = [
  { title: "Code", text: "Trace work and decisions across agents.", Figure: Branches },
  { title: "Security", text: "Keep private context inside your workspace.", Figure: Vault },
  { title: "Connectivity", text: "Give each agent one shared connection.", Figure: Relay },
  { title: "Data", text: "Turn activity into a readable record.", Figure: Phosphor },
];

export function HairlineFigures() {
  return <div className="stoic-figures-grid">{figures.map(({ title, text, Figure }) => <article className="stoic-figure-card" key={title}><Figure play intensity={0.45} theme="light" label={`${title} animated line figure`} /><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>;
}
