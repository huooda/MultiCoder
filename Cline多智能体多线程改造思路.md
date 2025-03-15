# Cline 多智能体多线程改造思路文档

## 1. 项目概述

Cline 是一个 VSCode 扩展，提供了代码编辑辅助功能，核心特点是能够创建/编辑文件、运行命令、使用浏览器等。目前它是以单智能体单线程的方式工作的，主要通过 `Cline` 类处理用户交互和 AI 功能。

## 2. 多智能体多线程改造目标

将 Cline 改造为多智能体多线程系统，使得多个 AI 智能体可以并行工作，提高效率和功能性。**重要的是，我们将基于 Cline 现有的架构和功能进行改造，重用已开发的组件，而非从头开始。**

## 3. 初始改造方案：双智能体协作系统

基于 Cline 现有的计划模式和执行模式，我们首先实现一个简化的双智能体系统：

### 3.1 智能体类型

1. **计划智能体（Planner Agent）**：
   - 继承和扩展 Cline 现有的 AI 模型
   - 负责理解用户需求
   - 制定解决方案和实施计划
   - 决定是否需要创建代码智能体
   - 为代码智能体提供目标、思路和代码规范
   - 接收代码智能体的成果并向用户汇报

2. **代码智能体（Coder Agent）**：
   - 由计划智能体按需创建
   - 复用 Cline 的执行模式功能
   - 根据计划智能体的指导实现具体代码
   - 完成任务后向计划智能体汇报

### 3.2 系统架构扩展

我们将在现有 Cline 架构基础上添加新的组件：

```
src/
  ├── agents/                    // 新增组件
  │   ├── BaseAgent.ts           // 基于Cline类抽象的基础智能体
  │   ├── PlannerAgent.ts        // 计划智能体
  │   ├── CoderAgent.ts          // 代码智能体 
  │   └── AgentManager.ts        // 智能体管理器
  │
  ├── coordination/              // 新增组件
  │   ├── MessageBus.ts          // 智能体间通信总线
  │   └── TaskQueue.ts           // 任务队列管理
  │
  └── webview/                   // 扩展现有组件
      ├── AgentChatView.ts       // 基于现有聊天界面扩展
      └── AgentUIManager.ts      // 界面管理器
```

## 4. 提示词设计与工具调用模式

我们将扩展 Cline 现有的工具调用系统，添加创建代码智能体的功能。

### 4.1 扩展工具调用定义

在 Cline 的现有 `toolUseNames` 中添加新工具：

```typescript
// 在现有的 toolUseNames 中添加
export const toolUseNames = [
  // 保留现有工具...
  "execute_command",
  "read_file",
  "write_to_file",
  "replace_in_file",
  "search_files",
  "list_files",
  // 新增工具
  "create_coder_agent",
] as const
```

### 4.2 扩展工具参数定义

为"创建代码智能体"工具添加参数，复用现有参数系统：

```typescript
// 在现有的 toolParamNames 中添加
export const toolParamNames = [
  // 保留现有参数...
  "command",
  "requires_approval",
  "path",
  "content",
  "diff",
  // 新增参数
  "task_description",
  "code_style",
  "requirements",
] as const
```

### 4.3 扩展系统提示词

在现有的 `SYSTEM_PROMPT` 函数中添加新工具描述，保持与现有格式一致：

```typescript
// 在 SYSTEM_PROMPT 中添加新工具描述
`
## create_coder_agent
Description: Create a new Coder Agent to work on a specific coding task. The Coder Agent will work in parallel while you continue planning and coordinating. Use this tool when a task involves complex code implementation that would benefit from dedicated focus.
Parameters:
- task_description: (required) A detailed description of the task for the Coder Agent to work on, including specific goals, expected functionality, and any constraints.
- code_style: (required) Style guidelines for the code to be produced, such as formatting, naming conventions, and design patterns to follow.
- requirements: (required) Technical requirements for the task, such as programming language, frameworks, libraries to use, and performance considerations.
Usage:
<create_coder_agent>
<task_description>Detailed task description here</task_description>
<code_style>Code style guidelines here</code_style>
<requirements>Technical requirements here</requirements>
</create_coder_agent>
`
```

### 4.4 智能体特定提示词

为计划智能体添加特定的工作流程指导，作为 Cline 现有系统提示词的补充：

```typescript
// 添加到 addUserInstructions 中计划模式下的指导
`
## 计划智能体指导

当你作为计划智能体工作时，请遵循以下流程：
1. 分析用户请求和要求
2. 制定解决方案的高级计划
3. 评估任务复杂性，决定是否需要创建代码智能体：
   - 对于复杂或大型代码任务，创建代码智能体
   - 对于简单任务或非编码任务，直接自己处理
4. 如果决定创建代码智能体，使用 create_coder_agent 工具，并提供:
   - 详细的任务描述
   - 代码风格指南
   - 技术要求
5. 继续与用户交互，同时监控代码智能体的进度
6. 收到代码智能体的成果后，进行审查并向用户报告

优先为大型代码实现或需要专注开发的任务创建代码智能体，确保提供明确的目标和约束。
`
```

### 4.5 集成到现有工具处理流程

扩展 `Cline` 类中处理工具调用的部分，添加对 `create_coder_agent` 工具的支持：

```typescript
// 在 Cline 类的 presentAssistantMessage 方法中添加新工具处理
async presentAssistantMessage() {
  // 保留现有代码...
  
  // 添加新工具处理
  if (block.name === "create_coder_agent") {
    const { task_description, code_style, requirements } = block.params;
    
    // 验证必要参数，复用现有的参数验证逻辑
    if (!task_description) {
      this.consecutiveMistakeCount++;
      pushToolResult(await this.sayAndCreateMissingParamError("create_coder_agent", "task_description"));
      break;
    }
    
    if (!code_style) {
      this.consecutiveMistakeCount++;
      pushToolResult(await this.sayAndCreateMissingParamError("create_coder_agent", "code_style"));
      break;
    }
    
    if (!requirements) {
      this.consecutiveMistakeCount++;
      pushToolResult(await this.sayAndCreateMissingParamError("create_coder_agent", "requirements"));
      break;
    }
    
    // 重置错误计数，复用现有逻辑
    this.consecutiveMistakeCount = 0;
    
    try {
      // 创建代码智能体
      const coderAgentId = await AgentManager.getInstance().createCoderAgent({
        plannerAgentId: this.taskId,
        taskSpec: {
          taskDescription: task_description,
          codeStyle: code_style,
          requirements: requirements
        }
      });
      
      // 向用户显示通知，复用 say 方法
      await this.say(
        "text",
        `已创建代码智能体来处理任务："${task_description.substring(0, 50)}${
          task_description.length > 50 ? "..." : ""
        }"`
      );
      
      // 返回工具执行结果，复用 formatResponse
      pushToolResult(
        formatResponse.toolResult(
          `代码智能体已创建，ID: ${coderAgentId.substring(0, 8)}。该智能体将在独立任务队列中工作，完成后会向你报告结果。`
        )
      );
      
      // 复用现有检查点保存逻辑
      await this.saveCheckpoint();
    } catch (error) {
      await this.handleError("创建代码智能体", error);
    }
    
    break;
  }
  
  // 保留现有代码...
}
```

## 5. 复用与扩展 Cline 现有组件

### 5.1 复用 Cline 类为基础智能体

将现有 `Cline` 类的核心功能抽象为基础智能体类：

```typescript
// 基于 Cline 类创建 BaseAgent
export abstract class BaseAgent {
  // 复用 Cline 类中的属性
  protected taskId: string;
  protected apiHandler: ApiHandler;
  protected checkpointTracker: CheckpointTracker;
  protected messages: ClineMessage[] = [];
  
  // 复用 Cline 的记忆和上下文管理
  protected consecutiveMistakeCount = 0;
  protected consecutiveAutoApprovedRequestsCount = 0;
  
  constructor(apiHandler: ApiHandler, checkpointTracker: CheckpointTracker) {
    this.taskId = crypto.randomUUID();
    this.apiHandler = apiHandler;
    this.checkpointTracker = checkpointTracker;
  }
  
  // 保留和抽象 Cline 类中的关键方法
  abstract async processTask(task: AgentTask): Promise<TaskResult>;
  
  // 复用 Cline 类的 say 方法
  async say(type: ClineSay, message: string, images?: string[], partial: boolean = false): Promise<void> {
    // 复用现有实现...
  }
  
  // 复用 Cline 类的 saveCheckpoint 方法
  async saveCheckpoint(): Promise<void> {
    // 复用现有实现...
  }
  
  // 复用其他重要方法...
}
```

### 5.2 复用 Webview 组件

扩展现有的 Webview 组件以支持多智能体：

```typescript
// 扩展 ClineProvider 类
export class AgentChatViewProvider extends ClineProvider {
  // 保留现有属性和方法
  
  // 扩展方法以支持多智能体消息显示
  sendAgentMessage(agentId: string, agentName: string, message: string): void {
    // 使用现有的 postMessageToWebview 方法，但增加智能体标识
    this.postMessageToWebview({
      type: 'newAgentMessage',
      agentId,
      agentName,
      message,
      timestamp: Date.now()
    });
  }
}
```

### 5.3 复用任务处理和事件系统

复用 VSCode 的 API 和 Cline 现有的事件处理机制：

```typescript
// 复用 VSCode 事件 API
const agentEventEmitter = new vscode.EventEmitter<AgentMessage>();
export const agentCommunicationChannel = agentEventEmitter.event;

// 复用 Cline 的异步处理模式
class TaskProcessor {
  private queue: Array<() => Promise<any>> = [];
  private running = false;
  
  // 复用现有的异步模式
  enqueue(task: () => Promise<any>): void {
    this.queue.push(task);
    if (!this.running) {
      this.processQueue();
    }
  }
  
  private async processQueue(): Promise<void> {
    // 复用现有的队列处理逻辑...
  }
}
```

### 5.4 复用记忆和上下文管理

充分利用 Cline 现有的记忆和上下文管理系统：

```typescript
// 扩展 AgentManager 以利用 Cline 的记忆和上下文管理
export class AgentManager {
  // 其他属性...
  
  // 复用 CheckpointTracker
  private checkpointTracker: CheckpointTracker;
  
  initialize(context: vscode.ExtensionContext): void {
    // 复用现有的检查点跟踪器初始化
    this.checkpointTracker = new CheckpointTracker(context);
    
    // 其他初始化...
  }
  
  // 其他方法...
}
```

## 6. 技术可行性分析与解决方案

### 6.1 VSCode窗口支持问题

Cline 已有成熟的 Webview 实现，我们可以扩展它：

#### 6.1.1 扩展现有 Webview

- **方案**：扩展 Cline 现有的 Webview 实现，而不是创建新的 Webview
- **优势**：
  - 复用现有代码
  - 保持用户界面一致性
  - 减少开发工作量

### 6.2 替代多窗口的UI方案

#### 6.2.1 扩展单一聊天界面（推荐）

扩展 Cline 现有的聊天界面，添加智能体标识：

```typescript
// 扩展消息数据结构，添加智能体标识
interface ExtendedChatMessage extends ClineMessage {
  agentId?: string;
  agentName?: string;
}

// 修改发送消息到 Webview 的代码
this.postMessageToWebview({
  type: 'newMessage',
  message: {
    ...message,
    agentId: agentId || 'planner',
    agentName: agentName || '计划智能体'
  }
});
```

### 6.3 复用 Cline 的异步处理机制

Cline 已经有成熟的异步处理机制，可以扩展为多任务队列：

```typescript
// 扩展现有的异步处理机制
class MultiAgentTaskProcessor {
  private queues: Map<string, TaskQueue> = new Map();
  
  // 获取或创建指定智能体的任务队列
  getQueue(agentId: string): TaskQueue {
    if (!this.queues.has(agentId)) {
      this.queues.set(agentId, new TaskQueue());
    }
    return this.queues.get(agentId)!;
  }
  
  // 添加智能体任务
  enqueueAgentTask(agentId: string, task: () => Promise<any>): void {
    this.getQueue(agentId).enqueue(task);
  }
}

// 复用现有的 TaskQueue 类
class TaskQueue {
  // 复用现有实现...
}
```

### 6.4 通信机制实现

复用 VSCode 的事件 API，与 Cline 现有机制集成：

```typescript
// 复用 VSCode 事件 API 进行智能体间通信
const agentEventEmitter = new vscode.EventEmitter<AgentMessage>();

// 集成到现有系统
context.subscriptions.push(
  agentEventEmitter.event(message => {
    AgentManager.getInstance().handleAgentMessage(message);
  })
);
```

### 6.5 复用 Cline 的状态管理

充分利用 Cline 现有的状态管理机制：

```typescript
// 复用 Cline 的状态管理
export class AgentStateManager {
  // 复用 vscode.ExtensionContext
  private context: vscode.ExtensionContext;
  
  // 复用现有的状态存储方法
  async setPersistentState(key: string, value: any): Promise<void> {
    await this.context.globalState.update(key, value);
  }
  
  // 其他方法...
}
```

### 6.6 技术方案总结

综合以上分析，我们的改造方案将：

1. **最大程度复用 Cline 现有组件**：
   - 复用 UI 组件和界面逻辑
   - 复用工具调用机制
   - 复用异步处理和状态管理

2. **扩展而非替换**：
   - 扩展现有 API 而不是创建新的
   - 保持与现有功能的兼容性
   - 确保渐进式部署

3. **保持一致的用户体验**：
   - 延续 Cline 现有的交互模式
   - 在现有界面基础上添加多智能体支持

## 7. 调整后的具体改造步骤

### 7.1 扩展 Cline 类和创建智能体基类

基于 Cline 类创建智能体基类，保留关键功能：

```typescript
// 扩展 Cline 类，添加智能体支持
export class ExtendedCline extends Cline {
  // 添加智能体管理器
  private agentManager: AgentManager;
  
  constructor(/* 保留现有参数 */) {
    super(/* 传递现有参数 */);
    this.agentManager = AgentManager.getInstance();
  }
  
  // 扩展工具处理，添加智能体创建工具
  async presentAssistantMessage() {
    // 调用原始方法
    await super.presentAssistantMessage();
    
    // 处理智能体相关消息
    // ...
  }
}

// 基于 Cline 功能创建基础智能体
export abstract class BaseAgent {
  // 复用 Cline 核心功能
  // ...
}
```

### 7.2 扩展 UI 组件

扩展 Cline 现有的 UI 组件以支持多智能体：

```typescript
// 扩展 ClineProvider 类
export class ExtendedClineProvider extends ClineProvider {
  // 保留现有功能
  
  // 添加多智能体支持
  // ...
}
```

### 7.3 实现智能体管理器

创建智能体管理器，集成到 Cline 现有系统：

```typescript
// 创建智能体管理器
export class AgentManager {
  private static instance: AgentManager;
  private agents: Map<string, BaseAgent> = new Map();
  
  // 集成到 Cline 的激活函数
  static initializeInExtension(context: vscode.ExtensionContext): void {
    const instance = AgentManager.getInstance();
    instance.initialize(context);
    
    // 集成到现有功能
    // ...
  }
  
  // 其他方法...
}
```

## 8. 工作流程

### 8.1 基本工作流程

1. 用户向计划智能体提出需求（通过现有 Cline 界面）
2. 计划智能体（扩展的 Cline 实例）分析需求并制定解决方案
3. 计划智能体决定是否需要创建代码智能体：
   - 如果需要，使用新增的 create_coder_agent 工具
   - 如果不需要，直接使用现有功能完成任务
4. 代码智能体在独立任务队列中工作
5. 代码智能体完成任务后向计划智能体汇报
6. 计划智能体综合结果，使用现有的界面向用户汇报

### 8.2 通信流程

```
            用户
              ↕
     Cline 现有聊天界面
     (带智能体标识扩展)
              ↕
          事件系统
     ↙              ↘
计划智能体          代码智能体
(Cline实例扩展)    (Cline实例扩展) 
(主任务队列)        (独立任务队列)
```

## 9. 后续扩展路径

这种基于 Cline 现有功能的双智能体系统为未来扩展提供了基础：

1. **测试智能体**：专注于生成测试用例和执行测试
2. **调试智能体**：专注于调试代码和修复问题
3. **架构智能体**：专注于系统架构设计和优化
4. **文档智能体**：专注于生成代码文档和注释

## 10. 优势和收益

这种改造方案有以下优势：

1. **最小化变更**：基于现有代码进行扩展，降低风险
2. **复用现有资产**：充分利用 Cline 现有组件和功能
3. **保持一致性**：用户体验与现有系统保持一致
4. **渐进式实现**：可以逐步添加多智能体功能
5. **技术可行性高**：避免了重新开发的复杂性
6. **维护成本低**：与现有代码库保持一致性，便于维护

## 11. 简化版实现路径

1. 第一阶段：扩展现有系统支持多智能体
   - 扩展 Cline 类以支持多智能体
   - 添加智能体管理器
   - 实现create_coder_agent工具

2. 第二阶段：增强智能体交互
   - 扩展UI显示智能体标识
   - 完善智能体间通信
   - 增强状态同步和错误处理

3. 第三阶段：增加更多智能体类型
   - 逐步添加其他类型的专门化智能体
   - 增强智能体协作能力
   - 优化资源使用和性能 