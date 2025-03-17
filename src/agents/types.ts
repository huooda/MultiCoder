/**
 * 智能体类型枚举
 */
export enum AgentType {
  Planner = 'planner',
  Coder = 'coder',
  User = 'user'
}

/**
 * 消息类型枚举
 */
export enum MessageType {
  Task = 'task',
  TaskComplete = 'task_complete',
  Status = 'status',
  Error = 'error'
}

/**
 * 任务类型枚举
 */
export enum TaskType {
  UserRequest = 'user_request',
  CodeImplementation = 'code_implementation'
}

/**
 * 智能体消息接口
 */
export interface AgentMessage {
  from: string
  to: string
  type: MessageType
  payload: any
  timestamp?: number
}

/**
 * 智能体任务接口
 */
export interface AgentTask {
  id: string
  type: TaskType
  content: string
  plannerAgentId?: string
  timestamp: number
  metadata?: Record<string, any>
}

/**
 * 任务结果接口
 */
export interface TaskResult {
  taskId: string
  success: boolean
  result: string
  error?: string
  metadata?: Record<string, any>
  processingStatus?: 'processing' | 'completed' | 'failed'
}

/**
 * 代码智能体任务规范
 */
export interface CoderTaskSpec {
  taskDescription: string
  codeStyle: string
  requirements: string
}

/**
 * 代码智能体创建参数
 */
export interface CoderAgentParams {
  plannerAgentId: string
  taskSpec: CoderTaskSpec
} 