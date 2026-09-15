import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { RestApiError } from './rest-client.js';

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Converts a REST API rejection into a tool-level error result instead of a
 * protocol-level failure, so the model sees why the call didn't work (e.g.
 * "article validation failed: block type X not allowed") and can react.
 */
export async function runTool(
  fn: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return jsonResult(await fn());
  } catch (error) {
    if (error instanceof RestApiError) {
      return errorResult(
        `REST API rejected the request (${error.status}): ${JSON.stringify(error.body)}`,
      );
    }
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}
