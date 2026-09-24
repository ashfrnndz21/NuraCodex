/** Provider port: adapters implement createResponse({ input, instructions, tools, toolChoice, signal }). */
export class LanguageModelUnavailableError extends Error {
  constructor(message = 'Nura’s answer service is not configured on this development server.') { super(message); this.name = 'LanguageModelUnavailableError'; }
}
