export type AgentChatColor = {
  accent: string;
  background: string;
  border: string;
  avatar: string;
};

export function agentChatColor(agentId: string, orderedAgentIds: string[]): AgentChatColor {
  const index = orderedAgentIds.indexOf(agentId);
  let fallback = 0;
  if (index < 0) {
    for (const character of agentId) fallback = (fallback * 31 + character.charCodeAt(0)) >>> 0;
  }
  const hue = (205 + (index < 0 ? fallback : index) * 137.508) % 360;
  return {
    accent: `hsl(${hue} 78% 62%)`,
    background: `hsl(${hue} 72% 54% / 0.12)`,
    border: `hsl(${hue} 78% 62% / 0.38)`,
    avatar: `hsl(${hue} 78% 62% / 0.22)`,
  };
}
