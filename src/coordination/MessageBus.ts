import * as vscode from "vscode"
import { AgentMessage } from "../agents/types"

/**
 * 消息总线
 * 负责智能体之间的通信
 */
export class MessageBus {
  private static instance: MessageBus
  
  // 使用VSCode的事件发射器作为通信通道
  private eventEmitter: vscode.EventEmitter<AgentMessage>
  private event: vscode.Event<AgentMessage>
  
  private constructor() {
    this.eventEmitter = new vscode.EventEmitter<AgentMessage>()
    this.event = this.eventEmitter.event
  }
  
  /**
   * 获取消息总线单例
   */
  static getInstance(): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus()
    }
    return MessageBus.instance
  }
  
  /**
   * 发送消息
   */
  sendMessage(message: AgentMessage): void {
    this.eventEmitter.fire(message)
  }
  
  /**
   * 注册消息处理器
   */
  onMessage(handler: (message: AgentMessage) => void): vscode.Disposable {
    return this.event(handler)
  }
  
  /**
   * 初始化消息总线
   */
  initialize(context: vscode.ExtensionContext): void {
    // 注册清理处理器
    context.subscriptions.push(
      this.eventEmitter
    )
  }
} 