import OpenAI from "openai";
import { liteLlmDefaultModelId, liteLlmModelInfoSaneDefaults } from "../../shared/api";
import { convertToOpenAiMessages } from "../transform/openai-format";
export class LiteLlmHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
        this.client = new OpenAI({
            baseURL: this.options.liteLlmBaseUrl || "http://localhost:4000",
            apiKey: this.options.liteLlmApiKey || "noop",
        });
    }
    async *createMessage(systemPrompt, messages) {
        const formattedMessages = convertToOpenAiMessages(messages);
        const systemMessage = {
            role: "system",
            content: systemPrompt,
        };
        const modelId = this.options.liteLlmModelId || liteLlmDefaultModelId;
        const isOminiModel = modelId.includes("o1-mini") || modelId.includes("o3-mini");
        let temperature = 0;
        if (isOminiModel) {
            temperature = undefined; // does not support temperature
        }
        const stream = await this.client.chat.completions.create({
            model: this.options.liteLlmModelId || liteLlmDefaultModelId,
            messages: [systemMessage, ...formattedMessages],
            temperature,
            stream: true,
            stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (chunk.usage) {
                yield {
                    type: "usage",
                    inputTokens: chunk.usage.prompt_tokens || 0,
                    outputTokens: chunk.usage.completion_tokens || 0,
                };
            }
        }
    }
    getModel() {
        return {
            id: this.options.liteLlmModelId || liteLlmDefaultModelId,
            info: liteLlmModelInfoSaneDefaults,
        };
    }
}
//# sourceMappingURL=litellm.js.map