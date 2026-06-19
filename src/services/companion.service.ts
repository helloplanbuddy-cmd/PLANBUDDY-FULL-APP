// ============================================================
// src/services/companion.service.ts — AI Buddy (chat) service
// ============================================================

import { streamChat as clientStreamChat } from '@/lib/apiClient';
import type { ChatMessage } from '@/lib/apiClient';

export const CompanionService = {
  /** Stream chat response from AI buddy */
  streamChat: (messages: ChatMessage[], signal?: AbortSignal, context?: unknown): Promise<Response> =>
    clientStreamChat(messages, signal, context),
};
