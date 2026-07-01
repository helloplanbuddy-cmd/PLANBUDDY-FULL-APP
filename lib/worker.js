// Compatibility shim for Next.js runtime expectations.
// Re-export the worker implementation without using CommonJS so ESLint stays green.

export { default } from '../BACKEND/planbuddy_v9/workers/webhook-processor.worker.js';

