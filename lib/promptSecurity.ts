// ============================================================
// lib/promptSecurity.ts — Prompt injection & abuse prevention
// Phase 2A: Firewall layer between user input and AI calls
// ============================================================

import { logger } from './logger';

// ── Injection pattern library ──────────────────────────────

const INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // Role/system overrides
  { pattern: /ignore\s+(previous|prior|all)\s+(instructions?|prompts?|context)/i,   label: 'ignore_instructions' },
  { pattern: /disregard\s+(previous|prior|all|your)\s+(instructions?|prompts?)/i,   label: 'disregard_instructions' },
  { pattern: /forget\s+(everything|all|your)\s+(instructions?|previous|context)/i,  label: 'forget_instructions' },
  { pattern: /you\s+are\s+now\s+(a\s+)?(?!buddy|an?\s+AI\s+travel)/i,              label: 'persona_override' },
  { pattern: /act\s+as\s+(?!a\s+travel|an?\s+AI\s+travel|buddy)/i,                 label: 'act_as_override' },
  // System prompt leaking
  { pattern: /<\/?system>/i,                                                          label: 'system_tags' },
  { pattern: /\[system\]/i,                                                           label: 'system_brackets' },
  { pattern: /##\s*system/i,                                                          label: 'system_header' },
  { pattern: /reveal\s+(your\s+)?(system\s+)?prompt/i,                               label: 'prompt_extraction' },
  { pattern: /print\s+(your\s+)?instructions/i,                                       label: 'instruction_extraction' },
  { pattern: /what\s+(are|were)\s+your\s+(initial\s+)?instructions/i,                label: 'instruction_query' },
  // Token abuse
  { pattern: /repeat\s+(the\s+)?(above|following|this)\s+\d{3,}/i,                  label: 'token_flood_repeat' },
  { pattern: /(.)\1{200,}/,                                                            label: 'character_flood' },
  // Jailbreaks
  { pattern: /developer\s+mode/i,                                                     label: 'developer_mode' },
  { pattern: /DAN\s+mode/i,                                                           label: 'dan_mode' },
  { pattern: /jailbreak/i,                                                             label: 'jailbreak_keyword' },
  { pattern: /\[INST\]|\[\/INST\]/,                                                   label: 'llama_injection' },
  { pattern: /<\|im_start\|>|<\|im_end\|>/,                                           label: 'chatml_injection' },
  { pattern: /\|\|.*\|\|.*override/i,                                                 label: 'pipe_override' },
  // Role tags
  { pattern: /^assistant:\s/im,                                                        label: 'role_injection_assistant' },
  { pattern: /^system:\s/im,                                                           label: 'role_injection_system' },
  { pattern: /^human:\s/im,                                                            label: 'role_injection_human' },
];

// ── Context poisoning patterns ─────────────────────────────

const CONTEXT_POISON_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\{[\s\S]*"role"\s*:\s*"system"[\s\S]*\}/,  label: 'json_system_role' },
  { pattern: /<!--[\s\S]*instructions[\s\S]*-->/i,        label: 'html_comment_injection' },
  { pattern: /\/\*[\s\S]*ignore[\s\S]*\*\//i,             label: 'block_comment_injection' },
];

// ── Sanitization ───────────────────────────────────────────

/**
 * Remove known injection artifacts from input while preserving legitimate content.
 */
function sanitizeInput(input: string): string {
  return input
    // Strip HTML/XML tags
    .replace(/<\/?[a-z][^>]*>/gi, '')
    // Strip markdown code blocks that could hide injections
    .replace(/```[\s\S]*?```/g, '[code block removed]')
    // Normalize whitespace
    .replace(/\s{10,}/g, ' ')
    // Strip null bytes
    .replace(/\0/g, '')
    .trim();
}

// ── Result types ───────────────────────────────────────────

export interface PromptCheckResult {
  safe:       boolean;
  sanitized:  string;
  violations: string[];
  riskScore:  number; // 0-10
}

// ── Main firewall function ─────────────────────────────────

/**
 * Check a user message for injection/abuse patterns.
 * Returns sanitized text and risk assessment.
 * Logs violations for security monitoring.
 */
export function checkPrompt(
  input:   string,
  userId:  string,
  context: string = 'chat'
): PromptCheckResult {
  const violations: string[] = [];
  let riskScore = 0;

  // 1. Hard length limit
  const truncated = input.slice(0, 4000);

  // 2. Check injection patterns
  for (const { pattern, label } of INJECTION_PATTERNS) {
    if (pattern.test(truncated)) {
      violations.push(label);
      riskScore += 3;
    }
  }

  // 3. Check context poisoning
  for (const { pattern, label } of CONTEXT_POISON_PATTERNS) {
    if (pattern.test(truncated)) {
      violations.push(label);
      riskScore += 4;
    }
  }

  // 4. Entropy check — very high entropy strings are suspicious
  const entropy = shannonEntropy(truncated);
  if (entropy > 5.5 && truncated.length > 200) {
    violations.push('high_entropy');
    riskScore += 1;
  }

  // 5. Sanitize
  const sanitized = sanitizeInput(truncated);

  // 6. Log violations (but not the actual content — privacy)
  if (violations.length > 0) {
    logger.warn({
      userId,
      context,
      violations,
      riskScore,
      inputLength: input.length,
    }, 'Prompt security violation detected');
  }

  // Block if risk score is high enough
  const safe = riskScore < 5 && violations.filter(v =>
    ['system_tags', 'ignore_instructions', 'disregard_instructions',
     'developer_mode', 'dan_mode', 'jailbreak_keyword',
     'json_system_role', 'llama_injection', 'chatml_injection'].includes(v)
  ).length === 0;

  return { safe, sanitized, violations, riskScore };
}

/**
 * Check an array of messages (conversation history).
 * Checks each message and returns overall safety assessment.
 */
export function checkConversation(
  messages: Array<{ role: string; content: string }>,
  userId:   string
): PromptCheckResult {
  const allViolations: string[] = [];
  let maxRisk = 0;
  const sanitizedMessages: string[] = [];

  for (const msg of messages) {
    if (msg.role !== 'user') continue;
    const result = checkPrompt(msg.content, userId, 'conversation');
    allViolations.push(...result.violations);
    maxRisk = Math.max(maxRisk, result.riskScore);
    sanitizedMessages.push(result.sanitized);
  }

  const allViolationsUniq = [...new Set(allViolations)];

  // Mirror checkPrompt: unsafe if riskScore >= 5 OR any critical violation present
  const CRITICAL_VIOLATIONS = [
    'system_tags', 'ignore_instructions', 'disregard_instructions',
    'developer_mode', 'dan_mode', 'jailbreak_keyword',
    'json_system_role', 'llama_injection', 'chatml_injection',
  ];
  const hasCritical = allViolationsUniq.some(v => CRITICAL_VIOLATIONS.includes(v));

  return {
    safe:       maxRisk < 5 && !hasCritical,
    sanitized:  sanitizedMessages.join('\n'),
    violations: allViolationsUniq,
    riskScore:  maxRisk,
  };
}

// ── Helpers ───────────────────────────────────────────────

function shannonEntropy(str: string): number {
  const len = str.length;
  if (len === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
