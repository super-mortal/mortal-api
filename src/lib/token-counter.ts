// ============================================================
// Token Counter
// Accurate token counting for Chinese/English mixed text
//
// Strategy (from MCP research):
// 1. Chinese characters ≈ 1 token each (for most Chinese LLMs)
// 2. English words ≈ 1 token per ~2-3 characters
// 3. For upstream calls we use the provider's usage field (most accurate)
// 4. This fallback is used when upstream doesn't return usage
// ============================================================

/**
 * Estimate token count for mixed Chinese/English text.
 * - Chinese char: ~1 token
 * - English word: ~1.3 tokens
 * - Numbers/special: ~0.5 tokens each
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let tokens = 0;
  let englishWord = '';

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (code >= 0x4e00 && code <= 0x9fff) {
      // Chinese character
      // Flush any accumulated English word
      if (englishWord) {
        tokens += Math.ceil(englishWord.length / 2.5);
        englishWord = '';
      }
      tokens += 1.0; // ~1 token per Chinese char
    } else if ((code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a)) {
      // English letter — accumulate
      englishWord += char;
    } else {
      // Number, space, punctuation, etc.
      if (englishWord) {
        tokens += Math.ceil(englishWord.length / 2.5);
        englishWord = '';
      }
      if (code >= 0x30 && code <= 0x39) {
        // Digits: ~1 token per 2-3 digits
        tokens += 0.4;
      } else {
        tokens += 0.25; // space/punctuation
      }
    }
  }

  // Flush remaining word
  if (englishWord) {
    tokens += Math.ceil(englishWord.length / 2.5);
  }

  return Math.max(1, Math.ceil(tokens));
}

/**
 * Count tokens in a messages array
 */
export function estimateMessagesTokens(messages: { role?: string; content?: string | null }[]): number {
  let total = 0;
  for (const msg of messages) {
    // Role token (~2 tokens per role marker)
    total += 2;
    // Content tokens
    if (msg.content) {
      total += estimateTokens(msg.content);
    }
  }
  // Add ~3 tokens for message formatting overhead
  return total + 3;
}

/**
 * Get token counts from upstream response if available,
 * fall back to estimation if not.
 */
export function extractTokenCounts(upstreamData: any): { prompt_tokens: number; completion_tokens: number } {
  // Try upstream usage first (most accurate)
  if (upstreamData?.usage?.prompt_tokens !== undefined) {
    return {
      prompt_tokens: upstreamData.usage.prompt_tokens || 0,
      completion_tokens: upstreamData.usage.completion_tokens || 0,
    };
  }

  // Estimate from content
  const promptText = upstreamData?.choices?.[0]?.message?.content || '';
  return {
    prompt_tokens: 0, // We don't have prompt in response
    completion_tokens: estimateTokens(promptText),
  };
}
