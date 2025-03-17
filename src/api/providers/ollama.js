import { Ollama } from "ollama";
import { openAiModelInfoSaneDefaults } from "../../shared/api";
import { convertToOllamaMessages } from "../transform/ollama-format";
export class OllamaHandler {
    options;
    client;
    constructor(options) {
        this.options = options;
        this.client = new Ollama({ host: this.options.ollamaBaseUrl || "http://localhost:11434" });
    }
    async *createMessage(systemPrompt, messages) {
        const ollamaMessages = [{ role: "system", content: systemPrompt }, ...convertToOllamaMessages(messages)];
        const stream = await this.client.chat({
            model: this.getModel().id,
            messages: ollamaMessages,
            stream: true,
            options: {
                num_ctx: Number(this.options.ollamaApiOptionsCtxNum) || 32768,
            },
        });
        for await (const chunk of stream) {
            if (typeof chunk.message.content === "string") {
                yield {
                    type: "text",
                    text: chunk.message.content,
                };
            }
        }
    }
    getModel() {
        return {
            id: this.options.ollamaModelId || "",
            info: openAiModelInfoSaneDefaults,
        };
    }
}
//# sourceMappingURL=ollama.js.map