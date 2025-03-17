import * as vscode from "vscode"
import { ApiHandler } from "../api"
import CheckpointTracker from "../integrations/checkpoints/CheckpointTracker"
import { BaseAgent } from "./BaseAgent"
import { AgentMessage, AgentTask, AgentType, CoderAgentParams, MessageType, TaskResult, TaskType } from "./types"
import { AgentManager } from "./AgentManager"

/**
 * 计划智能体类
 * 继承BaseAgent并专注于理解用户需求并制定高级计划
 */
export class PlannerAgent extends BaseAgent {
  constructor(
    apiHandler: ApiHandler,
    checkpointTracker: CheckpointTracker,
    eventEmitter: vscode.EventEmitter<AgentMessage>
  ) {
    super(AgentType.Planner, apiHandler, checkpointTracker, eventEmitter)
  }

  /**
   * 处理用户任务
   * @param task 用户请求任务
   */
  async processTask(task: AgentTask): Promise<TaskResult> {
    try {
      console.log(`[计划智能体] 正在处理任务: ${task.content}`)
      
      // 检查系统提示词是否已设置
      if (!this.systemPrompt) {
        console.warn('[计划智能体] 系统提示词未设置，使用默认提示词')
      }
      
      // 在实际实现中，将调用API进行任务分析，使用系统提示词
      await this.say('text', `正在分析任务：${task.content}`)
      
      // 这里是任务处理逻辑的实现点
      // 根据任务类型和内容，分析需求并决定是否需要创建代码智能体
      
      // 模拟任务分析过程
      if (this.shouldCreateCoderAgent(task.content)) {
        await this.say('text', '这个任务需要代码实现，我将创建一个代码智能体来处理...')
        
        // 创建代码智能体的参数
        const coderParams = {
          taskDescription: "实现一个简单的计数器组件",
          codeStyle: "模块化、注重代码可读性和可维护性",
          requirements: "使用TypeScript，遵循React最佳实践"
        }
        
        // 创建并启动代码智能体
        const coderAgentId = await this.createCoderAgent({
          plannerAgentId: this.getId(),
          taskSpec: {
            taskDescription: coderParams.taskDescription,
            codeStyle: coderParams.codeStyle,
            requirements: coderParams.requirements
          }
        })
        
        await this.say('text', `已创建代码智能体(ID: ${coderAgentId.substring(0, 8)})，正在实现代码...`)
        
        // 返回处理中状态，等待代码智能体完成工作
        return {
          taskId: task.id,
          success: true,
          result: "任务正在由代码智能体处理中...",
          processingStatus: "processing"
        }
      } else {
        // 处理不需要代码实现的任务
        await this.say('text', '分析完成，这是一个可以直接回答的任务')
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        await this.say('text', '正在整理解决方案...')
        await new Promise(resolve => setTimeout(resolve, 800))
        
        await this.say('text', '方案已就绪！')
        
        return {
          taskId: task.id,
          success: true,
          result: `已完成任务分析：${task.content}\n\n这是一个直接回答类型的任务，不需要代码实现。\n\n解决方案：[此处是实际解决方案]`
        }
      }
    } catch (error) {
      console.error(`[计划智能体] 处理任务时出错:`, error)
      return {
        taskId: task.id,
        success: false,
        result: `处理任务时出错: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
  
  /**
   * 判断是否应该创建代码智能体
   * 实际实现中，将基于任务分析结果和复杂度评估
   */
  private shouldCreateCoderAgent(taskContent: string): boolean {
    // 模拟决策逻辑，实际实现将更复杂
    const complexTaskKeywords = [
      'implement', '实现', 'create', '创建', 'develop', '开发',
      'code', '代码', 'function', '函数', 'class', '类',
      'component', '组件', 'module', '模块', 'system', '系统'
    ]
    
    // 检查任务内容是否包含复杂度指示词
    return complexTaskKeywords.some(keyword => 
      taskContent.toLowerCase().includes(keyword.toLowerCase())
    )
  }
  
  /**
   * 创建代码智能体
   */
  async createCoderAgent(params: CoderAgentParams): Promise<string> {
    return await AgentManager.getInstance().createCoderAgent(params)
  }
  
  /**
   * 处理代码智能体的完成消息
   */
  handleCoderAgentCompletion(message: AgentMessage): void {
    const { payload } = message
    console.log(`[计划智能体] 收到代码智能体完成消息:`, payload)
    
    // 向用户报告代码智能体的结果
    this.say('text', `代码智能体已完成任务：${payload.result}`)
  }
} 