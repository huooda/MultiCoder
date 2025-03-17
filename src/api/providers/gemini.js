var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "../retry";
import { geminiDefaultModelId, geminiModels } from "../../shared/api";
import { convertAnthropicMessageToGemini } from "../transform/gemini-format";
export class GeminiHandler {
    options;
    client;
    constructor(options) {
        if (!options.geminiApiKey) {
            throw new Error("API key is required for Google Gemini");
        }
        this.options = options;
        this.client = new GoogleGenerativeAI(options.geminiApiKey);
    }
    async *createMessage(systemPrompt, messages) {
        const model = this.client.getGenerativeModel({
            model: this.getModel().id,
            systemInstruction: systemPrompt,
        });
        const result = await model.generateContentStream({
            contents: messages.map(convertAnthropicMessageToGemini),
            generationConfig: {
                // maxOutputTokens: this.getModel().info.maxTokens,
                temperature: 0,
            },
        });
        for await (const chunk of result.stream) {
            yield {
                type: "text",
                text: chunk.text(),
            };
        }
        const response = await result.response;
        yield {
            type: "usage",
            inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        };
    }
    getModel() {
        const modelId = this.options.apiModelId;
        if (modelId && modelId in geminiModels) {
            const id = modelId;
            return { id, info: geminiModels[id] };
        }
        return {
            id: geminiDefaultModelId,
            info: geminiModels[geminiDefaultModelId],
        };
    }
}
__decorate([
    withRetry()
], GeminiHandler.prototype, "createMessage", null);
//# sourceMappingURL=gemini.js.map