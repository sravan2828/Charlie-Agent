/**
 * Present the brain's tool schemas to a LiveKit AgentSession.
 *
 * `tool` is passed in from `@livekit/agents` so this module can be read
 * without loading the native LiveKit runtime. The execute callback only
 * forwards arguments to the brain; it does not grant extra permission.
 *
 * @param {import("../brain/brain.js").Brain} brain
 * @param {Function} tool LiveKit `tool()` helper
 */
export function bindBrainTools(brain, tool) {
  return brain.toolSchemas().map((schema) => {
    const fn = schema.function;
    return tool({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
      execute: async (args) => {
        const result = await brain.executeTool(fn.name, args || {}, {
          transcript: "",
        });
        return JSON.stringify(result);
      },
    });
  });
}
