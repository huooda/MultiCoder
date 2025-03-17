import * as vscode from "vscode";
/**
 * 消息总线
 * 负责智能体之间的通信
 */
export class MessageBus {
    static instance;
    // 使用VSCode的事件发射器作为通信通道
    eventEmitter;
    event;
    constructor() {
        this.eventEmitter = new vscode.EventEmitter();
        this.event = this.eventEmitter.event;
    }
    /**
     * 获取消息总线单例
     */
    static getInstance() {
        if (!MessageBus.instance) {
            MessageBus.instance = new MessageBus();
        }
        return MessageBus.instance;
    }
    /**
     * 发送消息
     */
    sendMessage(message) {
        this.eventEmitter.fire(message);
    }
    /**
     * 注册消息处理器
     */
    onMessage(handler) {
        return this.event(handler);
    }
    /**
     * 初始化消息总线
     */
    initialize(context) {
        // 注册清理处理器
        context.subscriptions.push(this.eventEmitter);
    }
}
//# sourceMappingURL=MessageBus.js.map