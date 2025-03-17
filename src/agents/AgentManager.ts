import * as vscode from "vscode"
import { ApiHandler, buildApiHandler } from "../api"
import CheckpointTracker from "../integrations/checkpoints/CheckpointTracker"
import { ApiConfiguration } from "../shared/api"
import { BaseAgent } from "./BaseAgent"
import { CoderAgent } from "./CoderAgent"
import { PlannerAgent } from "./PlannerAgent"
import { AgentMessage, AgentType, CoderAgentParams, MessageType } from "./types"
import { BrowserSettings, DEFAULT_BROWSER_SETTINGS } from "../shared/BrowserSettings"
import { PLANNER_AGENT_PROMPT } from "../core/prompts/planner_agent"
import { CODER_AGENT_PROMPT } from "../core/prompts/coder_agent"

/**
 * 智能体管理器
 * 负责创建、获取和销毁智能体
 */
export class AgentManager {
  private static instance: AgentManager
  
  // 智能体集合，用ID作为键
  private agents: Map<string, BaseAgent> = new Map()
  
  // 事件发射器，用于智能体间通信
  private eventEmitter: vscode.EventEmitter<AgentMessage> = new vscode.EventEmitter<AgentMessage>()
  
  // API配置和处理器
  private apiConfiguration?: ApiConfiguration
  private apiHandler?: ApiHandler
  
  // 检查点跟踪器
  private checkpointTracker?: CheckpointTracker
  
  // 浏览器设置
  private browserSettings: BrowserSettings = DEFAULT_BROWSER_SETTINGS
  
  // 当前工作目录
  private cwd: string = ""
  
  private constructor() {
    // 私有构造函数，确保单例模式
    
    // 注册事件处理器
    this.eventEmitter.event(message => {
      this.handleAgentMessage(message)
    })
  }
  
  /**
   * 获取AgentManager单例
   */
  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager()
    }
    return AgentManager.instance
  }
  
  /**
   * 初始化AgentManager
   */
  initialize(
    context: vscode.ExtensionContext,
    apiConfiguration: ApiConfiguration
  ): void {
    // 保存API配置
    this.apiConfiguration = apiConfiguration
    
    // 创建API处理器
    this.apiHandler = buildApiHandler(apiConfiguration)
    
    // 设置当前工作目录
    this.cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? ""
    
    // 创建检查点跟踪器
    CheckpointTracker.create("agent-manager", context.globalStorageUri.fsPath)
      .then(tracker => {
        this.checkpointTracker = tracker
        console.log('[AgentManager] 检查点跟踪器初始化完成')
      })
      .catch(error => {
        console.error('[AgentManager] 检查点跟踪器初始化失败:', error)
      })
    
    // 注册事件监听器
    context.subscriptions.push(
      this.eventEmitter.event(message => {
        this.handleAgentMessage(message)
      })
    )
    
    console.log('[AgentManager] 初始化完成')
  }
  
  /**
   * 获取提示词模板
   */
  private async getPlannerSystemPrompt(): Promise<string> {
    try {
      return await PLANNER_AGENT_PROMPT(this.cwd, this.browserSettings)
    } catch (error) {
      console.error('[AgentManager] 获取计划智能体提示词失败:', error)
      throw new Error('获取计划智能体提示词失败')
    }
  }
  
  /**
   * 获取代码智能体提示词模板
   */
  private async getCoderSystemPrompt(): Promise<string> {
    try {
      return await CODER_AGENT_PROMPT(this.cwd, this.browserSettings)
    } catch (error) {
      console.error('[AgentManager] 获取代码智能体提示词失败:', error)
      throw new Error('获取代码智能体提示词失败')
    }
  }
  
  /**
   * 创建计划智能体
   */
  async createPlannerAgent(): Promise<string> {
    if (!this.apiHandler || !this.checkpointTracker) {
      throw new Error('AgentManager未初始化，无法创建智能体')
    }
    
    const plannerAgent = new PlannerAgent(
      this.apiHandler,
      this.checkpointTracker,
      this.eventEmitter
    )
    
    // 设置系统提示词
    const systemPrompt = await this.getPlannerSystemPrompt()
    await plannerAgent.setSystemPrompt(systemPrompt)
    
    const agentId = plannerAgent.getId()
    this.agents.set(agentId, plannerAgent)
    
    console.log(`[AgentManager] 创建了计划智能体 (ID: ${agentId.substring(0, 8)})`)
    
    return agentId
  }
  
  /**
   * 创建代码智能体
   */
  async createCoderAgent(params: CoderAgentParams): Promise<string> {
    if (!this.apiHandler || !this.checkpointTracker) {
      throw new Error('AgentManager未初始化，无法创建智能体')
    }
    
    const { plannerAgentId, taskSpec } = params
    
    // 检查计划智能体是否存在
    if (!this.agents.has(plannerAgentId)) {
      throw new Error(`未找到指定的计划智能体 (ID: ${plannerAgentId})`)
    }
    
    const coderAgent = new CoderAgent(
      this.apiHandler,
      this.checkpointTracker,
      this.eventEmitter,
      plannerAgentId,
      taskSpec
    )
    
    // 设置系统提示词
    const systemPrompt = await this.getCoderSystemPrompt()
    await coderAgent.setSystemPrompt(systemPrompt)
    
    const agentId = coderAgent.getId()
    this.agents.set(agentId, coderAgent)
    
    console.log(`[AgentManager] 创建了代码智能体 (ID: ${agentId.substring(0, 8)})`)
    
    return agentId
  }
  
  /**
   * 获取计划智能体
   * 如果不存在则创建一个新的
   */
  async getPlannerAgent(): Promise<PlannerAgent> {
    // 查找已存在的计划智能体
    for (const [id, agent] of this.agents.entries()) {
      if (agent instanceof PlannerAgent) {
        return agent as PlannerAgent
      }
    }
    
    // 如果不存在，创建一个新的
    const agentId = await this.createPlannerAgent()
    return this.agents.get(agentId) as PlannerAgent
  }
  
  /**
   * 获取代码智能体
   */
  getCoderAgent(agentId: string): CoderAgent | undefined {
    const agent = this.agents.get(agentId)
    
    if (agent && agent instanceof CoderAgent) {
      return agent as CoderAgent
    }
    
    return undefined
  }
  
  /**
   * 处理用户消息
   */
  async handleUserMessage(content: string): Promise<void> {
    // 获取计划智能体
    const plannerAgent = await this.getPlannerAgent()
    
    // 创建用户任务
    const task = {
      id: `task-${Date.now()}`,
      type: 'user_request' as any,
      content,
      timestamp: Date.now()
    }
    
    // 将任务分配给计划智能体
    await plannerAgent.processTask(task)
  }
  
  /**
   * 处理智能体间消息
   */
  private handleAgentMessage(message: AgentMessage): void {
    console.log(`[AgentManager] 收到消息: ${message.from} -> ${message.to}, 类型: ${message.type}`)
    
    // 处理消息
    const targetAgent = this.agents.get(message.to)
    if (!targetAgent) {
      console.error(`[AgentManager] 未找到目标智能体 (ID: ${message.to})`)
      return
    }
    
    // 根据消息类型处理
    if (message.type === MessageType.TaskComplete && targetAgent instanceof PlannerAgent) {
      (targetAgent as PlannerAgent).handleCoderAgentCompletion(message)
    }
  }
} 