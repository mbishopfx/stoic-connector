const MAX_RTF_BYTES = 25 * 1024 * 1024;
const MAX_PREVIEW_CHARACTERS = 5000;
const MAX_GROUP_DEPTH = 2048;

const HIDDEN_DESTINATIONS = new Set([
  "colortbl", "datastore", "fldinst", "fonttbl", "footer", "footerf", "footerl", "footerr",
  "generator", "header", "headerf", "headerl", "headerr", "info", "listoverridetable",
  "listtable", "nonshppict", "object", "pict", "private", "revtbl", "shppict",
  "stylesheet", "themedata", "xmlnstbl",
]);

const CONTROL_TEXT: Record<string, string> = {
  bullet: "•",
  emdash: "—",
  endash: "–",
  lquote: "‘",
  ldblquote: "“",
  rquote: "’",
  rdblquote: "”",
};

type GroupState = { skip: boolean; unicodeFallbackCount: number };

function ansiByte(value: number) {
  return new TextDecoder("windows-1252").decode(Uint8Array.of(value));
}

function isHiddenDestination(source: string, openingBrace: number) {
  const header = source.slice(openingBrace + 1).match(/^\\(\*)?([a-z]+)/i);
  return Boolean(header && (header[1] === "*" || HIDDEN_DESTINATIONS.has(header[2].toLowerCase())));
}

function unicodeCodeUnit(value: number) {
  return String.fromCharCode(value < 0 ? value + 65536 : value);
}

export function extractRtfPreview(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_RTF_BYTES) throw new Error("RTF document exceeds preview size limit");

  const source = new TextDecoder("windows-1252").decode(bytes);
  if (!/^\s*\{\\rtf\d+/i.test(source)) throw new Error("File is not a valid RTF document");

  const output: string[] = [];
  const groups: GroupState[] = [];
  let skip = false;
  let unicodeFallbackCount = 1;
  let skipFallbackCharacters = 0;
  let index = 0;
  let outputLength = 0;

  const emit = (value: string) => {
    if (skip || !value || outputLength >= MAX_PREVIEW_CHARACTERS) return;
    const bounded = value.slice(0, MAX_PREVIEW_CHARACTERS - outputLength);
    output.push(bounded);
    outputLength += bounded.length;
  };

  while (index < source.length && outputLength < MAX_PREVIEW_CHARACTERS) {
    const character = source[index];

    if (character === "{") {
      if (groups.length >= MAX_GROUP_DEPTH) throw new Error("RTF group nesting exceeds preview limit");
      groups.push({ skip, unicodeFallbackCount });
      if (isHiddenDestination(source, index)) skip = true;
      index++;
      continue;
    }
    if (character === "}") {
      const parent = groups.pop();
      if (parent) {
        skip = parent.skip;
        unicodeFallbackCount = parent.unicodeFallbackCount;
      }
      index++;
      continue;
    }
    if (character === "\r" || character === "\n") {
      index++;
      continue;
    }

    if (skipFallbackCharacters > 0 && !skip && character !== "\\" && character !== "{" && character !== "}") {
      skipFallbackCharacters--;
      index++;
      continue;
    }

    if (character !== "\\") {
      emit(character);
      index++;
      continue;
    }

    const next = source[index + 1];
    if (!next) break;

    if (next === "'") {
      const hex = source.slice(index + 2, index + 4);
      if (/^[0-9a-f]{2}$/i.test(hex)) {
        if (skipFallbackCharacters > 0 && !skip) skipFallbackCharacters--;
        else emit(ansiByte(Number.parseInt(hex, 16)));
        index += 4;
        continue;
      }
    }

    if (["\\", "{", "}"].includes(next)) {
      if (skipFallbackCharacters > 0 && !skip) skipFallbackCharacters--;
      else emit(next);
      index += 2;
      continue;
    }
    if (next === " ") {
      if (skipFallbackCharacters > 0 && !skip) skipFallbackCharacters--;
      else emit(" ");
      index += 2;
      continue;
    }
    if (next === "~") {
      if (skipFallbackCharacters > 0 && !skip) skipFallbackCharacters--;
      else emit(" ");
      index += 2;
      continue;
    }
    if (next === "_") {
      if (skipFallbackCharacters > 0 && !skip) skipFallbackCharacters--;
      else emit("-");
      index += 2;
      continue;
    }
    if (next === "-") {
      index += 2;
      continue;
    }

    const control = source.slice(index).match(/^\\([a-z]+)(-?\d+)? ?/i);
    if (control) {
      const word = control[1].toLowerCase();
      const parameter = control[2] ? Number.parseInt(control[2], 10) : undefined;
      const tokenLength = control[0].length;
      if (skipFallbackCharacters > 0 && !skip) {
        skipFallbackCharacters--;
      } else if (word === "par" || word === "line" || word === "row") {
        emit("\n");
      } else if (word === "tab" || word === "cell") {
        emit(word === "tab" ? "\t" : "\t");
      } else if (word === "u" && parameter !== undefined) {
        emit(unicodeCodeUnit(parameter));
        skipFallbackCharacters = unicodeFallbackCount;
      } else if (word === "uc" && parameter !== undefined) {
        unicodeFallbackCount = Math.max(0, Math.min(16, parameter));
      } else if (word === "bin" && parameter !== undefined && parameter > 0) {
        index += tokenLength + Math.min(parameter, source.length - index - tokenLength);
        continue;
      } else if (word in CONTROL_TEXT) {
        emit(CONTROL_TEXT[word]);
      }
      index += tokenLength;
      continue;
    }

    if (skipFallbackCharacters > 0 && !skip) skipFallbackCharacters--;
    index += 2;
  }

  return output.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_PREVIEW_CHARACTERS);
}
