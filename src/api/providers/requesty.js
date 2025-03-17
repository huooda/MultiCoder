var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import OpenAI from "openai";
import { openAiModelInfoSaneDefaults } from "../../shared/api";
import { withRetry } from "../retry";
import { convertToOpenAiMessages } from "../transform/openai-format";
export class RequestyHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
        this.client = new OpenAI({
            baseURL: "https://router.requesty.ai/v1",
            apiKey: this.options.requestyApiKey,
            defaultHeaders: {
                "HTTP-Referer": "https://cline.bot",
                "X-Title": "Cline",
            },
        });
    }
    async *createMessage(systemPrompt, messages) {
        const modelId = this.options.requestyModelId ?? "";
        let openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        // @ts-ignore-next-line
        const stream = await this.client.chat.completions.create({
            model: modelId,
            messages: openAiMessages,
            temperature: 0,
            stream: true,
            stream_options: { include_usage: true },
            ...(modelId === "openai/o3-mini" ? { reasoning_effort: this.options.o3MiniReasoningEffort || "medium" } : {}),
        });
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            if (delta && "reasoning_content" in delta && delta.reasoning_content) {
                yield {
                    type: "reasoning",
                    reasoning: delta.reasoning_content || "",
                };
            }
            if (chunk.usage) {
                const usage = chunk.usage;
                const inputTokens = usage.prompt_tokens || 0;
                const outputTokens = usage.completion_tokens || 0;
                const cacheWriteTokens = usage.prompt_tokens_details?.caching_tokens || undefined;
                const cacheReadTokens = usage.prompt_tokens_details?.cached_tokens || undefined;
                const totalCost = 0; // TODO: Replace with calculateApiCostOpenAI(model.info, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
                yield {
                    type: "usage",
                    inputTokens: inputTokens,
                    outputTokens: outputTokens,
                    cacheWriteTokens: cacheWriteTokens,
                    cacheReadTokens: cacheReadTokens,
                    totalCost: totalCost,
                };
            }
        }
    }
    getModel() {
        return {
            id: this.options.requestyModelId ?? "",
            info: openAiModelInfoSaneDefaults,
        };
    }
}
__decorate([
    withRetry()
], RequestyHandler.prototype, "createMessage", null);
//# sourceMappingURL=requesty.js.map