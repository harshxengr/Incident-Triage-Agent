// LLMs love wrapping JSON in ```json fences, or tacking a sentence onto
// the front. this strips the common wrappers, then throws a clear error
// with the actual bad output attached if it's still not parseable -
// silently swallowing a malformed response is how agents make up data.
function extractJsonSubstring(str: string): string {
  const firstBrace = str.indexOf('{');
  const firstBracket = str.indexOf('[');

  if (firstBrace === -1 && firstBracket === -1) {
    return str;
  }

  const startIdx = firstBrace === -1 ? firstBracket : (firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket));
  const startChar = str[startIdx]!;
  const endChar = startChar === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < str.length; i++) {
    const char = str[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === startChar) {
        depth++;
      } else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return str.slice(startIdx, i + 1);
        }
      }
    }
  }

  return str;
}

export function parseLLMJson<T>(raw: string, isValid: (value: unknown) => value is T): T {
  let cleaned = raw.trim();

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) cleaned = fenceMatch[1].trim();

  cleaned = extractJsonSubstring(cleaned);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM response wasn't valid JSON after cleanup: ${cleaned.slice(0, 200)}`);
  }

  if (!isValid(parsed)) {
    throw new Error(`LLM response JSON didn't match the expected shape: ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  return parsed;
}