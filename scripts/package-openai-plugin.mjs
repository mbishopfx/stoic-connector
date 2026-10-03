import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(repoRoot, "openai-plugin");
const outputPath = path.join(repoRoot, "dist", "stoic-connector-openai-plugin.zip");
const manifest = JSON.parse(await readFile(path.join(packageRoot, "plugin.json"), "utf8"));
const mcpConfig = JSON.parse(await readFile(path.join(packageRoot, "mcp.json"), "utf8"));
const submission = JSON.parse(await readFile(path.join(repoRoot, "chatgpt-app-submission.json"), "utf8"));
const mcpRouteSource = await readFile(path.join(repoRoot, "src", "app", "api", "mcp", "route.ts"), "utf8");
const openai = manifest.extensions?.["com.openai"];
const interfaceMetadata = openai?.interface;
const positive = openai?.review?.test_cases?.positive;
const negative = openai?.review?.test_cases?.negative;

assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
assert.equal(manifest.name, "stoic-connector");
assert.equal(interfaceMetadata?.displayName, "Stoic Connector");
assert.ok(interfaceMetadata?.privacyPolicyURL && interfaceMetadata?.termsOfServiceURL && interfaceMetadata?.supportURL);
assert.equal(mcpConfig.mcpServers?.stoic?.type, "streamable-http");
assert.equal(mcpConfig.mcpServers?.stoic?.url, "https://stoic.bishoptech.dev/api/mcp");
assert.equal(Object.hasOwn(manifest, "apps"), false, "Public package must not use the currently unsupported apps/.app.json mapping.");
assert.equal(Object.hasOwn(openai, "apps"), false, "Public package must not use the currently unsupported apps/.app.json mapping.");
assert.equal(positive?.length, 5, "OpenAI submission requires exactly five positive test cases.");
assert.equal(negative?.length, 3, "OpenAI submission requires exactly three negative test cases.");
assert.equal(interfaceMetadata?.defaultPrompt?.length, 3);

assert.deepEqual(
  positive.map(({ prompt, tools_triggered }) => ({ prompt, tools_triggered })),
  submission.test_cases.map(({ user_prompt, tools_triggered }) => ({ prompt: user_prompt, tools_triggered })),
  "Packaged positive prompts and expected tools must match the reviewed source test set.",
);
assert.deepEqual(
  negative.map(({ prompt }) => prompt),
  submission.negative_test_cases.map(({ user_prompt }) => user_prompt),
  "Packaged negative prompts must match the reviewed source test set.",
);
const registeredTools = new Set([...mcpRouteSource.matchAll(/(?:registerAppTool\(server,\s*|server\.registerTool\()\s*"([^"]+)"/g)].map((match) => match[1]));
for (const match of mcpRouteSource.matchAll(/\["([a-z][a-z0-9_]*)",\s*"[a-z][a-z0-9_]*",\s*"[^"]+"\]/g)) {
  registeredTools.add(match[1]);
}
assert.deepEqual(
  Object.keys(submission.tools).sort(), [...registeredTools].sort(),
  "The submission snapshot must list every current MCP tool, including Contact Link, before packaging.",
);
assert.match(mcpRouteSource, /server\.registerTool\("link_contact",\s*\{\s*annotations:\s*writeAnnotations/);
assert.deepEqual(submission.tools.link_contact.annotations, { readOnlyHint: false, openWorldHint: false, destructiveHint: false });
assert.ok(interfaceMetadata.defaultPrompt.some((prompt) => prompt.includes("confirmed interaction")));
const onboardingSkill = await readFile(path.join(packageRoot, "skills/stoic-team-coordination/SKILL.md"), "utf8");
for (const name of ["search_contacts", "create_contact", "link_contact"]) {
  assert.ok(onboardingSkill.includes(name), `Onboarding skill must cover the ${name} tool.`);
}
for (const testCase of positive) {
  for (const toolName of testCase.tools_triggered.split(",").map((name) => name.trim())) {
    assert.ok(registeredTools.has(toolName), `Review case references an unregistered MCP tool: ${toolName}`);
  }
}

const referencedFiles = [
  interfaceMetadata.composerIcon,
  interfaceMetadata.composerIconDark,
  interfaceMetadata.logo,
  interfaceMetadata.logoDark,
  openai.onboardingSkill,
];
for (const reference of referencedFiles) {
  assert.ok(reference?.startsWith("./"), `Manifest paths must be relative to the package root: ${reference}`);
  await readFile(path.join(packageRoot, reference.slice(2)));
}

async function collectFiles(directory) {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...await collectFiles(absolutePath));
    else if (entry.isFile()) entries.push(absolutePath);
    else throw new Error(`Unsupported package entry: ${absolutePath}`);
  }
  return entries;
}

const files = await collectFiles(packageRoot);
assert.ok(files.includes(path.join(packageRoot, "plugin.json")));
assert.ok(files.includes(path.join(packageRoot, "mcp.json")));
const approvedPackageFiles = new Set([
  "agents/openai.yaml",
  "assets/stoic-connector-directory-icon.png",
  "mcp.json",
  "plugin.json",
  "skills/stoic-team-coordination/SKILL.md",
]);
const packagePaths = files.map((absolutePath) => path.relative(packageRoot, absolutePath).split(path.sep).join("/"));
assert.deepEqual([...packagePaths].sort(), [...approvedPackageFiles].sort(), "Review package contents before adding files to the public ZIP.");
const archiveEntries = Object.fromEntries(await Promise.all(files.map(async (absolutePath) => {
  const relativePath = path.relative(packageRoot, absolutePath).split(path.sep).join("/");
  const bytes = new Uint8Array(await readFile(absolutePath));
  if (relativePath.endsWith(".json") || relativePath.endsWith(".yaml") || relativePath.endsWith(".md")) {
    const text = new TextDecoder().decode(bytes);
    const secretLikeValue = /(?:sk-(?:proj|live|test)-[A-Za-z0-9_-]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/;
    assert.equal(secretLikeValue.test(text), false, `Potential credential found in ${relativePath}.`);
  }
  return [relativePath, bytes];
})));

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, zipSync(archiveEntries, { level: 9 }));
console.log(`Packaged ${files.length} files for Stoic Connector at ${path.relative(repoRoot, outputPath)}.`);
console.log("Included 5 positive cases, 3 negative cases, one remote MCP server, and no app-reference mapping or secrets.");
