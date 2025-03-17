import { v4 as uuidv4 } from 'uuid';
import { AgentType } from './types';
/**
 * 基础智能体类 - 基于Cline类进行抽象
 * 提供所有智能体共享的基本功能
 */
export class BaseAgent {
    // 基本属性
    taskId;
    agentType;
    apiHandler;
    checkpointTracker;
    messages = [];
    // 复用Cline的记忆和上下文管理
    consecutiveMistakeCount = 0;
    consecutiveAutoApprovedRequestsCount = 0;
    // 事件处理
    eventEmitter;
    // 系统提示词
    systemPrompt = "";
    constructor(agentType, apiHandler, checkpointTracker, eventEmitter) {
        this.taskId = uuidv4();
        this.agentType = agentType;
        this.apiHandler = apiHandler;
        this.checkpointTracker = checkpointTracker;
        this.eventEmitter = eventEmitter;
    }
    /**
     * 获取智能体ID
     */
    getId() {
        return this.taskId;
    }
    /**
     * 获取智能体类型
     */
    getType() {
        return this.agentType;
    }
    /**
     * 获取智能体显示名称
     */
    getDisplayName() {
        return this.agentType === AgentType.Planner
            ? '计划智能体'
            : '代码智能体';
    }
    /**
     * 发送消息到其他智能体
     */
    sendMessage(targetAgentId, message) {
        this.eventEmitter.fire({
            from: this.taskId,
            to: targetAgentId,
            ...message,
        });
    }
    /**
     * 复用Cline类的发送消息方法
     */
    async say(type, message, images, partial = false) {
        // 具体实现将在扩展类中完成
        console.log(`[${this.getDisplayName()}]: ${message}`);
    }
    /**
     * 复用Cline类的保存检查点方法
     */
    async saveCheckpoint() {
        // 具体实现将在扩展类中完成，调用checkpointTracker
        try {
            // TODO: 实现检查点保存逻辑
        }
        catch (error) {
            console.error('保存检查点时出错:', error);
        }
    }
    /**
     * 设置系统提示词
     * @param prompt 系统提示词
     */
    async setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
        console.log(`[${this.getDisplayName()}] 系统提示词已设置`);
    }
    /**
     * 获取系统提示词
     */
    getSystemPrompt() {
        return this.systemPrompt;
    }
}
//# sourceMappingURL=BaseAgent.js.map