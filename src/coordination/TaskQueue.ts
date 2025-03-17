/**
 * 任务队列
 * 用于异步处理任务，避免阻塞主线程
 */
export class TaskQueue {
  private queue: Array<() => Promise<any>> = []
  private running = false

  /**
   * 将任务添加到队列
   */
  enqueue(task: () => Promise<any>): void {
    this.queue.push(task)
    if (!this.running) {
      this.processQueue()
    }
  }

  /**
   * 处理队列中的任务
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.running = false
      return
    }

    this.running = true
    const task = this.queue.shift()!

    try {
      await task()
    } catch (error) {
      console.error('任务执行出错:', error)
    }

    // 处理下一个任务
    this.processQueue()
  }
}

/**
 * 多智能体任务处理器
 * 为每个智能体维护独立的任务队列
 */
export class MultiAgentTaskProcessor {
  private queues: Map<string, TaskQueue> = new Map()

  /**
   * 获取指定智能体的任务队列
   * 如果不存在则创建一个新的
   */
  getQueue(agentId: string): TaskQueue {
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, new TaskQueue())
    }
    return this.queues.get(agentId)!
  }

  /**
   * 为智能体添加任务
   */
  enqueueTask(agentId: string, task: () => Promise<any>): void {
    this.getQueue(agentId).enqueue(task)
  }

  /**
   * 添加计划智能体任务
   */
  enqueuePlannerTask(agentId: string, task: any): void {
    this.enqueueTask(agentId, async () => {
      const agentManager = await import('../agents/AgentManager').then(m => m.AgentManager.getInstance())
      const plannerAgent = await agentManager.getPlannerAgent()
      await plannerAgent.processTask(task)
    })
  }

  /**
   * 添加代码智能体任务
   */
  enqueueCoderTask(agentId: string, task: any): void {
    this.enqueueTask(agentId, async () => {
      const agentManager = await import('../agents/AgentManager').then(m => m.AgentManager.getInstance())
      const coderAgent = agentManager.getCoderAgent(agentId)
      if (coderAgent) {
        await coderAgent.processTask(task)
      } else {
        console.error(`未找到指定的代码智能体 (ID: ${agentId})`)
      }
    })
  }
} 