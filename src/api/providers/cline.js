import OpenAI from "openai";
import { openRouterDefaultModelId, openRouterDefaultModelInfo } from "../../shared/api";
import { createOpenRouterStream } from "../transform/openrouter-stream";
import axios from "axios";
export class ClineHandler {
    options;
    client;
    lastGenerationId;
    constructor(options) {
        this.options = options;
        this.client = new OpenAI({
            baseURL: "https://api.cline.bot/v1",
            apiKey: this.options.clineApiKey || "",
        });
    }
    async *createMessage(systemPrompt, messages) {
        this.lastGenerationId = undefined;
        const stream = await createOpenRouterStream(this.client, systemPrompt, messages, this.getModel(), this.options.o3MiniReasoningEffort, this.options.thinkingBudgetTokens);
        for await (const chunk of stream) {
            // openrouter returns an error object instead of the openai sdk throwing an error
            if ("error" in chunk) {
                const error = chunk.error;
                console.error(`Cline API Error: ${error?.code} - ${error?.message}`);
                // Include metadata in the error message if available
                const metadataStr = error.metadata ? `\nMetadata: ${JSON.stringify(error.metadata, null, 2)}` : "";
                throw new Error(`Cline API Error ${error.code}: ${error.message}${metadataStr}`);
            }
            if (!this.lastGenerationId && chunk.id) {
                this.lastGenerationId = chunk.id;
            }
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            // Reasoning tokens are returned separately from the content
            if ("reasoning" in delta && delta.reasoning) {
                yield {
                    type: "reasoning",
                    // @ts-ignore-next-line
                    reasoning: delta.reasoning,
                };
            }
        }
        const apiStreamUsage = await this.getApiStreamUsage();
        if (apiStreamUsage) {
            yield apiStreamUsage;
        }
    }
    async getApiStreamUsage() {
        if (this.lastGenerationId) {
            try {
                const response = await axios.get(`https://api.cline.bot/v1/generation?id=${this.lastGenerationId}`, {
                    headers: {
                        Authorization: `Bearer ${this.options.clineApiKey}`,
                    },
                    timeout: 15_000, // this request hangs sometimes
                });
                const generation = response.data;
                return {
                    type: "usage",
                    inputTokens: generation?.native_tokens_prompt || 0,
                    outputTokens: generation?.native_tokens_completion || 0,
                    totalCost: generation?.total_cost || 0,
                };
            }
            catch (error) {
                // ignore if fails
                console.error("Error fetching cline generation details:", error);
            }
        }
        return undefined;
    }
    getModel() {
        const modelId = this.options.openRouterModelId;
        const modelInfo = this.options.openRouterModelInfo;
        if (modelId && modelInfo) {
            return { id: modelId, info: modelInfo };
        }
        return { id: openRouterDefaultModelId, info: openRouterDefaultModelInfo };
    }
}
//# sourceMappingURL=cline.js.map