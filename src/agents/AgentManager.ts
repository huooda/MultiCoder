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
import { AutoApprovalSettings } from "../shared/AutoApprovalSettings"
import { ChatSettings } from "../shared/ChatSettings"
import { Cline } from "../core/Cline"
import { ClineProvider } from "../core/webview/ClineProvider"

/**
 * 智能体管理器
 * 负责创建、获取和销毁智能体
 */
export class AgentManager {
  private static instance: AgentManager
  
  // 智能体集合，用ID作为键
  private agents: Map<string, BaseAgent> = new Map()
  
  // 检查点锁，用于协调多智能体访问
  private checkpointLock: boolean = false
  private checkpointQueue: Array<() => Promise<void>> = []
  
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
  
  // 初始化状态
  public isInitialized: boolean = false
  
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
   * 返回Promise以确保初始化完成
   */
  async initialize(
    context: vscode.ExtensionContext,
    apiConfiguration: ApiConfiguration,
    browserSettings: BrowserSettings = DEFAULT_BROWSER_SETTINGS
  ): Promise<void> {
    // 保存API配置
    this.apiConfiguration = apiConfiguration
    
    // 保存浏览器设置
    this.browserSettings = browserSettings
    
    // 创建API处理器
    this.apiHandler = buildApiHandler(apiConfiguration)
    
    // 设置当前工作目录
    this.cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? ""
    
    // 注册事件监听器
    context.subscriptions.push(
      this.eventEmitter.event(message => {
        this.handleAgentMessage(message)
      })
    )
    
    // 创建检查点跟踪器并等待完成
    try {
      this.checkpointTracker = await CheckpointTracker.create("agent-manager", context.globalStorageUri.fsPath)
      console.log('[AgentManager] 检查点跟踪器初始化完成')
      this.isInitialized = true
    } catch (error) {
      console.error('[AgentManager] 检查点跟踪器初始化失败:', error)
      throw error
    }
    
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
    try {
      // 获取计划智能体
      const plannerAgent = await this.getPlannerAgent()
      
      // 创建用户任务
      const task = {
        id: `task-${Date.now()}`,
        type: 'user_request' as any,
        content,
        timestamp: Date.now()
      }
      
      console.log(`[AgentManager] 将用户任务分配给计划智能体`)
      
      // 使用检查点锁机制，将任务分配给计划智能体
      await this.runCheckpointOperation(async () => {
        await plannerAgent.processTask(task)
      })
    } catch (error) {
      console.error(`[AgentManager] 处理用户消息时出错:`, error)
    }
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
  
  /**
   * 创建Cline智能体实例
   * 将Cline纳入统一管理
   */
  async createClineAgent(
    context: vscode.ExtensionContext,
    apiConfiguration: ApiConfiguration,
    autoApprovalSettings: AutoApprovalSettings,
    browserSettings: BrowserSettings = DEFAULT_BROWSER_SETTINGS,
    chatSettings: ChatSettings,
    customInstructions?: string,
    task?: string,
    images?: string[],
    historyItem?: any,  // 添加历史记录项参数
    existingProvider?: ClineProvider,  // 现有的ClineProvider实例
    agentType: 'planner' | 'coder' = 'planner',  // 智能体类型，默认为计划智能体
    plannerAgentId?: string  // 如果是代码智能体，需要关联的计划智能体ID
  ): Promise<Cline> {
    // 检查是否已初始化
    if (!this.isInitialized) {
      console.log('[AgentManager] AgentManager尚未初始化，正在初始化...')
      await this.initialize(context, apiConfiguration, browserSettings)
    }
    
    // 二次检查初始化状态和所需资源
    if (!this.apiHandler || !this.checkpointTracker) {
      const errorMsg = 'AgentManager未初始化，无法创建智能体'
      console.error(`[AgentManager] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    // 如果是代码智能体，需要验证plannerAgentId
    if (agentType === 'coder' && !plannerAgentId) {
      const errorMsg = '创建代码智能体需要提供计划智能体ID'
      console.error(`[AgentManager] ${errorMsg}`)
      throw new Error(errorMsg)
    }
    
    console.log(`[AgentManager] 开始创建${agentType === 'coder' ? '代码' : '计划'}智能体...`)
    
    try {
      // 使用传入的ClineProvider或创建新的（作为回退选项）
      let clineProvider: ClineProvider
      if (existingProvider) {
        console.log('[AgentManager] 使用现有ClineProvider')
        clineProvider = existingProvider
      } else {
        console.log('[AgentManager] 未提供ClineProvider，创建新的实例')
        const outputChannel = vscode.window.createOutputChannel("Cline Agent")
        clineProvider = new ClineProvider(context, outputChannel)
      }
      
      // 创建Cline实例
      const cline = new Cline(
        clineProvider,
        apiConfiguration,
        autoApprovalSettings,
        browserSettings,
        chatSettings,
        customInstructions,
        task,      // 传递任务参数，会自动启动
        images,    // 传递图片参数
        historyItem  // 传递历史记录项
      )
      
      // 设置智能体类型
      cline.setAgentType(agentType)
      
      // 如果是代码智能体，设置关联的计划智能体ID
      if (agentType === 'coder' && plannerAgentId) {
        cline.setPlannerAgentId(plannerAgentId)
      }
      
      // 使用任务ID作为智能体ID
      const agentId = cline.taskId
      
      // 将Cline实例注册到智能体管理
      // 注意：Cline不是BaseAgent的子类，但我们仍在同一集合中管理它
      // 这里使用类型断言，实际使用时需要区分处理
      this.agents.set(agentId, cline as any)
      
      console.log(`[AgentManager] 成功创建${agentType === 'coder' ? '代码' : '计划'}智能体 (ID: ${agentId.substring(0, 8)})`)
      
      return cline
    } catch (error) {
      console.error(`[AgentManager] 创建${agentType === 'coder' ? '代码' : '计划'}智能体失败:`, error)
      throw error
    }
  }
  
  /**
   * 在独立线程中运行智能体任务
   * @param agentId 智能体ID
   * @param taskContent 任务内容
   * @param images 可选的图片数组
   */
  runAgentInSeparateThread(agentId: string, taskContent: string, images?: string[]): void {
    // 获取智能体
    const agent = this.agents.get(agentId)
    if (!agent) {
      console.error(`[AgentManager] 未找到智能体 (ID: ${agentId})`)
      return
    }
    
    // 创建任务
    const task = {
      id: `task-${Date.now()}`,
      type: 'user_request' as any,
      content: taskContent,
      timestamp: Date.now()
    }
    
    // 在独立Promise中异步运行任务，并使用检查点锁机制
    Promise.resolve().then(async () => {
      try {
        // 如果是BaseAgent的实例，调用processTask
        if ('processTask' in agent) {
          // 使用检查点锁确保串行执行检查点相关操作
          const result = await this.runCheckpointOperation(async () => {
            return await (agent as BaseAgent).processTask(task)
          })
          console.log(`[AgentManager] 智能体 ${agentId} 任务执行结果:`, result)
        } 
        // 如果是Cline实例，直接调用startTask
        else if ('startTask' in agent && typeof (agent as any).startTask === 'function') {
          // 使用检查点锁确保串行执行检查点相关操作
          await this.runCheckpointOperation(async () => {
            await (agent as any).startTask(taskContent, images)
          })
          console.log(`[AgentManager] Cline智能体 ${agentId} 已开始执行任务`)
        }
        else {
          console.error(`[AgentManager] 无法识别的智能体类型:`, agent)
        }
      } catch (error) {
        console.error(`[AgentManager] 智能体 ${agentId} 任务执行错误:`, error)
      }
    })
    
    console.log(`[AgentManager] 已启动智能体 ${agentId} 在独立线程中`)
  }
  
  /**
   * 获取Cline实例
   */
  getClineAgent(agentId: string): Cline | undefined {
    const agent = this.agents.get(agentId)
    
    // 检查是否是Cline实例
    if (agent && 'startTask' in agent) {
      return agent as unknown as Cline
    }
    
    return undefined
  }
  
  /**
   * 执行检查点操作，确保操作串行执行
   * @param operation 需要执行的检查点操作函数
   */
  private async runCheckpointOperation<T>(operation: () => Promise<T>): Promise<T> {
    // 如果当前锁被占用，将操作加入队列并等待执行
    if (this.checkpointLock) {
      return new Promise<T>((resolve, reject) => {
        const queuedOperation = async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        };
        this.checkpointQueue.push(queuedOperation);
      });
    }
    
    // 获取锁
    this.checkpointLock = true;
    try {
      // 执行操作
      const result = await operation();
      
      // 释放锁
      this.checkpointLock = false;
      
      // 检查队列中是否有等待的操作
      if (this.checkpointQueue.length > 0) {
        const nextOperation = this.checkpointQueue.shift();
        if (nextOperation) {
          // 异步执行下一个操作
          Promise.resolve().then(() => nextOperation());
        }
      }
      
      return result;
    } catch (error) {
      // 发生错误时也要释放锁
      this.checkpointLock = false;
      throw error;
    }
  }
  
  /**
   * 获取Cline实例，如果不存在则创建一个新的
   */
  async getClineAgentOrCreate(
    context: vscode.ExtensionContext,
    apiConfiguration: ApiConfiguration,
    autoApprovalSettings: AutoApprovalSettings,
    browserSettings: BrowserSettings = DEFAULT_BROWSER_SETTINGS,
    chatSettings: ChatSettings,
    customInstructions?: string,
    task?: string,
    images?: string[],
    historyItem?: any,
    existingProvider?: ClineProvider,
    agentType: 'planner' | 'coder' = 'planner',  // 智能体类型，默认为计划智能体
    plannerAgentId?: string  // 如果是代码智能体，需要关联的计划智能体ID
  ): Promise<Cline> {
    // 查找已存在的Cline实例
    // 注意：这里我们只查找第一个可用的Cline实例
    // 实际应用中可能需要更复杂的匹配逻辑
    for (const [id, agent] of this.agents.entries()) {
      // 通过检查特定的属性和方法来判断是否为Cline实例
      if (agent && 'startTask' in agent && 'disposables' in agent) {
        console.log(`[AgentManager] 复用现有Cline实例 (ID: ${id.substring(0, 8)})`)
        
        // 如果找到的是Cline实例，尝试设置智能体类型和关联ID
        if ('setAgentType' in agent) {
          (agent as any).setAgentType(agentType)
          
          // 如果是代码智能体，设置关联的计划智能体ID
          if (agentType === 'coder' && plannerAgentId && 'setPlannerAgentId' in agent) {
            (agent as any).setPlannerAgentId(plannerAgentId)
          }
        }
        
        return agent as unknown as Cline
      }
    }
    
    // 如果不存在，创建一个新的
    console.log(`[AgentManager] 未找到现有Cline实例，创建新的${agentType === 'coder' ? '代码' : '计划'}智能体实例`)
    return this.createClineAgent(
      context,
      apiConfiguration,
      autoApprovalSettings,
      browserSettings,
      chatSettings,
      customInstructions,
      task,
      images,
      historyItem,
      existingProvider,
      agentType,
      plannerAgentId
    )
  }
  
  /**
   * 从计划智能体创建代码智能体
   * 由计划智能体调用，用于创建一个与之关联的代码智能体
   */
  async createCoderAgentFromPlanner(
    plannerAgentId: string,
    task: string,
    images?: string[]
  ): Promise<string> {
    // 验证计划智能体存在
    if (!this.agents.has(plannerAgentId)) {
      throw new Error(`未找到指定的计划智能体 (ID: ${plannerAgentId})`)
    }
    
    // 获取计划智能体实例，使用其配置信息
    const plannerAgent = this.agents.get(plannerAgentId) as any
    
    // 从计划智能体中提取必要的配置信息
    // 注意：这需要Cline或BaseAgent有获取这些配置的方法
    // 这里简化处理，使用AgentManager自身的配置
    if (!this.apiHandler || !this.checkpointTracker) {
      throw new Error('AgentManager未初始化，无法创建智能体')
    }
    
    // 找到可能的ClineProvider实例
    let existingProvider: ClineProvider | undefined
    if ('providerRef' in plannerAgent && plannerAgent.providerRef) {
      try {
        existingProvider = plannerAgent.providerRef.deref()
      } catch (error) {
        console.warn('[AgentManager] 无法获取计划智能体的ClineProvider实例:', error)
      }
    }
    
    // 获取必要的上下文
    const context = existingProvider?.context
    if (!context) {
      throw new Error('无法获取扩展上下文')
    }
    
    // 创建代码智能体
    const cline = await this.createClineAgent(
      context,
      this.apiConfiguration!, // 必须已初始化
      { 
        enabled: true,
        actions: {
          readFiles: true,
          editFiles: true,
          executeCommands: true,
          useBrowser: true,
          useMcp: false
        },
        maxRequests: 5, 
        enableNotifications: true 
      }, // 默认自动审批设置
      this.browserSettings,
      { mode: "act" }, // 默认聊天设置
      undefined, // 无自定义指令
      task,
      images,
      undefined, // 无历史记录
      existingProvider,
      'coder', // 指定为代码智能体
      plannerAgentId // 关联到计划智能体
    )
    
    console.log(`[AgentManager] 计划智能体 ${plannerAgentId.substring(0, 8)} 创建了代码智能体 ${cline.taskId.substring(0, 8)}`)
    
    return cline.taskId
  }
} 