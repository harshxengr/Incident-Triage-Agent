export interface LLMClient {
  complete(system: string, prompt: string): Promise<string>;
}

// check ai.google.dev for the current flash model name if this one's been
// retired by the time you're reading this - Google rotates these often
export class GeminiClient implements LLMClient {
  constructor(private apiKey: string, private model = "gemini-3.6-flash") {}

  async complete(system: string, prompt: string): Promise<string> {
    const maxRetries = 5;
    let attempt = 0;
    let delay = 1000;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.apiKey,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json", // asks Gemini to skip the markdown fences entirely
              },
            }),
          }
        );

        if (!res.ok) {
          const isTransient = res.status === 429 || res.status === 503 || res.status >= 500;
          if (isTransient && attempt < maxRetries) {
            const errorText = await res.text().catch(() => "Unknown error");
            console.warn(
              `[GeminiClient] Transient API error ${res.status} (${errorText.substring(0, 100).trim()}). Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
          throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
        }

        const data = (await res.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                text?: string;
              }>;
            };
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Gemini response had no text content");
        return text;
      } catch (err: any) {
        if (attempt < maxRetries) {
          console.warn(
            `[GeminiClient] Request failed: ${err.message || err}. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
    throw new Error("Failed after maximum retries");
  }
}

// Canned responses for local dev and the Phase 6 eval harness - lets every
// agent's parsing/business logic get exercised without an API key or
// burning quota. Each call consumes the next response in order; the last
// one repeats if you run out.
export class MockLLMClient implements LLMClient {
  private callIndex = 0;

  constructor(private responses: string[]) {}

  async complete(_system: string, _prompt: string): Promise<string> {
    const response = this.responses[this.callIndex] ?? this.responses[this.responses.length - 1] ?? "";
    this.callIndex++;
    return response;
  }
}