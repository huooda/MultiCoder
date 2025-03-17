import { ClineProvider } from "../core/webview/ClineProvider";
import { AgentManager } from "../agents/AgentManager";
/**
 * 扩展的聊天视图提供者
 * 基于现有ClineProvider，添加对多智能体的支持
 */
export class AgentChatViewProvider extends ClineProvider {
    static viewType = 'cline.agentChatView';
    /**
     * 发送智能体消息到Webview
     * 使用现有的消息类型，将智能体信息添加到消息内容中
     */
    sendAgentMessage(agentId, agentName, message) {
        // 将智能体信息添加到消息内容中
        const formattedMessage = `[${agentName}]: ${message}`;
        // 使用partialMessage类型，这是一个有效的消息类型
        this.postMessageToWebview({
            type: 'partialMessage',
            partialMessage: {
                ts: Date.now(),
                type: 'say',
                say: 'text',
                text: formattedMessage
            }
        });
    }
    /**
     * 处理来自Webview的消息
     * 扩展原有的handleWebviewMessage方法
     */
    async handleAgentWebviewMessage(message) {
        // 处理智能体相关的消息
        if (message.type === 'userMessage') {
            // 将用户消息转发给AgentManager
            const agentManager = AgentManager.getInstance();
            await agentManager.handleUserMessage(message.content);
        }
    }
    /**
     * 注册智能体消息处理器
     */
    registerAgentMessageHandlers() {
        // 处理智能体消息
        const messageBus = require('../coordination/MessageBus').MessageBus.getInstance();
        messageBus.onMessage((message) => {
            if (message.type === 'task_complete') {
                // 处理任务完成消息
                const { from, payload } = message;
                const agentManager = AgentManager.getInstance();
                const agent = agentManager.getCoderAgent(from);
                if (agent) {
                    // 在界面上显示代码智能体的完成消息
                    this.sendAgentMessage(from, agent.getDisplayName(), `任务完成: ${payload.result}`);
                }
            }
        });
    }
    /**
     * 扩展UI以支持显示多智能体标识
     * 使用现有的消息类型
     */
    extendUiForMultiAgent() {
        // 使用theme类型，这是一个有效的消息类型
        this.postMessageToWebview({
            type: 'theme',
            // 不需要额外的字段，主题信息会在前端处理
        });
    }
}
//# sourceMappingURL=AgentChatViewProvider.js.map