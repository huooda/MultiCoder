import { v4 as uuidv4 } from 'uuid'
import * as vscode from "vscode"
import { ApiHandler } from "../api"
import CheckpointTracker from "../integrations/checkpoints/CheckpointTracker"
import { ClineMessage, ClineSay } from "../shared/ExtensionMessage"
import { AgentMessage, AgentType, AgentTask, TaskResult } from './types'

/**
 * 基础智能体类 - 基于Cline类进行抽象
 * 提供所有智能体共享的基本功能
 */
export abstract class BaseAgent {
  // 基本属性
  protected taskId: string
  protected agentType: AgentType
  protected apiHandler: ApiHandler
  protected checkpointTracker: CheckpointTracker
  protected messages: ClineMessage[] = []
  
  // 复用Cline的记忆和上下文管理
  protected consecutiveMistakeCount = 0
  protected consecutiveAutoApprovedRequestsCount = 0
  
  // 事件处理
  protected eventEmitter: vscode.EventEmitter<AgentMessage>
  
  // 系统提示词
  protected systemPrompt: string = ""
  
  constructor(
    agentType: AgentType,
    apiHandler: ApiHandler,
    checkpointTracker: CheckpointTracker,
    eventEmitter: vscode.EventEmitter<AgentMessage>
  ) {
    this.taskId = uuidv4()
    this.agentType = agentType
    this.apiHandler = apiHandler
    this.checkpointTracker = checkpointTracker
    this.eventEmitter = eventEmitter
  }

  /**
   * 获取智能体ID
   */
  getId(): string {
    return this.taskId
  }

  /**
   * 获取智能体类型
   */
  getType(): AgentType {
    return this.agentType
  }

  /**
   * 获取智能体显示名称
   */
  getDisplayName(): string {
    return this.agentType === AgentType.Planner 
      ? '计划智能体' 
      : '代码智能体'
  }
  
  /**
   * 发送消息到其他智能体
   */
  sendMessage(targetAgentId: string, message: Partial<AgentMessage>): void {
    this.eventEmitter.fire({
      from: this.taskId,
      to: targetAgentId,
      ...message,
    } as AgentMessage)
  }
  
  /**
   * 处理任务的抽象方法
   * 每个智能体类型需要实现此方法
   */
  abstract processTask(task: AgentTask): Promise<TaskResult>
  
  /**
   * 复用Cline类的发送消息方法
   */
  async say(type: ClineSay, message: string, images?: string[], partial: boolean = false): Promise<void> {
    // 具体实现将在扩展类中完成
    console.log(`[${this.getDisplayName()}]: ${message}`)
  }
  
  /**
   * 复用Cline类的保存检查点方法
   */
  async saveCheckpoint(): Promise<void> {
    // 具体实现将在扩展类中完成，调用checkpointTracker
    try {
      // TODO: 实现检查点保存逻辑
    } catch (error) {
      console.error('保存检查点时出错:', error)
    }
  }

  /**
   * 设置系统提示词
   * @param prompt 系统提示词
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt
    console.log(`[${this.getDisplayName()}] 系统提示词已设置`)
  }
  
  /**
   * 获取系统提示词
   */
  getSystemPrompt(): string {
    return this.systemPrompt
  }
} 