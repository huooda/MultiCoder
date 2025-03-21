# Cline多智能体多线程改造思路

## Planner智能体工作分析

### 1. Planner智能体整体架构

Planner智能体（即Cline类）是当前系统的核心，负责处理用户任务、与API交互以及管理UI界面。以下是其主要工作：

- **任务初始化与管理**：通过`startTask`和`resumeTaskFromHistory`方法初始化任务
- **API交互**：负责与语言模型API通信，生成响应
- **消息处理**：通过`say`和`ask`方法向UI发送消息
- **工具调用**：处理各种工具方法的调用（如文件操作、终端命令等）
- **状态管理**：维护会话状态并保存到磁盘

### 2. Planner与UI的交互方式

Planner主要通过以下方式与UI交互：

- **消息发送**：通过`say`方法发送消息到UI
  ```typescript
  async say(type: ClineSay, text?: string, images?: string[], partial?: boolean): Promise<undefined>
  ```
  
- **提问交互**：通过`ask`方法向用户提问获取输入
  ```typescript
  async ask(type, text, partial)
  ```

- **状态传递**：通过`postStateToWebview`方法将当前状态传递给UI
  ```typescript
  await this.providerRef.deref()?.postStateToWebview()
  ```

- **消息持久化**：使用`addToClineMessages`和`saveClineMessages`方法将消息保存到磁盘

### 3. 关键方法分析

- **initClineWithTask**：初始化Planner处理新任务
- **recursivelyMakeClineRequests**：递归处理API请求并展示结果
- **presentAssistantMessage**：将助手消息呈现给用户
- **initiateTaskLoop**：启动任务循环，持续处理任务直到完成或中断

## Coder智能体设计方案（简化版）

### 1. 基本架构设计

#### 1.1 使用现有Cline类

不创建新的类，而是利用Cline类的agentType参数来区分不同类型的智能体：

```typescript
constructor(
  provider: ClineProvider,
  apiConfiguration: ApiConfiguration,
  autoApprovalSettings: AutoApprovalSettings,
  browserSettings: BrowserSettings,
  chatSettings: ChatSettings,
  agentType: 'planner' | 'coder' = 'planner',  // 使用这个参数区分智能体类型
  customInstructions?: string,
  task?: string,
  images?: string[],
  historyItem?: HistoryItem,
) {
  // ...初始化代码
  this.agentType = agentType;
  // ...其余初始化
}
```

根据智能体类型执行不同的任务启动逻辑：

```typescript
async startTask(task?: string, images?: string[]): Promise<void> {
  // ...初始化代码

  // 根据智能体类型选择不同的启动路径
  if (this.agentType === 'coder') {
    // 代码智能体特有启动逻辑
    await this.startCoderTask(task, images);
  } else {
    // 默认为计划智能体的启动逻辑
    await this.startPlannerTask(task, images);
  }
}
```

#### 1.2 在ClineProvider中管理Coder实例

在ClineProvider中添加coder属性：

```typescript
// 在ClineProvider类中
planner?: Cline; // 计划智能体实例
coder?: Cline;   // 代码智能体实例

async createCoderAgent(task: string) {
  const { apiConfiguration, customInstructions, autoApprovalSettings, browserSettings, chatSettings } = await this.getState();
  
  // 创建一个新的Cline实例，指定agentType为'coder'
  this.coder = new Cline(
    this,
    apiConfiguration,
    autoApprovalSettings,
    browserSettings,
    chatSettings,
    'coder',  // 设置agentType为'coder'
    customInstructions,
    task
  );
  
  // 返回coder的taskId
  return this.coder.taskId;
}
```

### 2. 状态管理设计

#### 2.1 修改ExtensionState接口

在ExtensionState接口中添加coderMessages字段：

```typescript
interface ExtensionState {
  // 现有字段
  version: string;
  apiConfiguration?: ApiConfiguration;
  customInstructions?: string;
  uriScheme?: string;
  currentTaskItem?: HistoryItem;
  checkpointTrackerErrorMessage?: string;
  clineMessages: ClineMessage[]; // 保持向后兼容，存放planner消息
  
  // 新增字段
  coderMessages: ClineMessage[]; // coder智能体的消息
}
```

#### 2.2 修改getStateToPostToWebview方法

在ClineProvider中更新getStateToPostToWebview方法：

```typescript
async getStateToPostToWebview(): Promise<ExtensionState> {
  const {
    apiConfiguration,
    lastShownAnnouncementId,
    customInstructions,
    taskHistory,
    autoApprovalSettings,
    browserSettings,
    chatSettings,
    userInfo,
    mcpMarketplaceEnabled,
    telemetrySetting,
    planActSeparateModelsSetting,
  } = await this.getState();

  return {
    version: this.context.extension?.packageJSON?.version ?? "",
    apiConfiguration,
    customInstructions,
    uriScheme: vscode.env.uriScheme,
    currentTaskItem: this.planner?.taskId ? (taskHistory || []).find((item) => item.id === this.planner?.taskId) : undefined,
    checkpointTrackerErrorMessage: this.planner?.checkpointTrackerErrorMessage,
    plannerMessages: this.planner?.clineMessages || [],
    coderMessages: this.coder?.clineMessages || [],
    taskHistory: (taskHistory || [])
      .filter((item) => item.ts && item.task)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 100), // for now we're only getting the latest 100 tasks, but a better solution here is to only pass in 3 for recent task history, and then get the full task history on demand when going to the task history view (maybe with pagination?)
    shouldShowAnnouncement: lastShownAnnouncementId !== this.latestAnnouncementId,
    platform: process.platform as Platform,
    autoApprovalSettings,
    browserSettings,
    chatSettings,
    userInfo,
    mcpMarketplaceEnabled,
    telemetrySetting,
    planActSeparateModelsSetting,
    vscMachineId: vscode.env.machineId,
  }
}
```

### 3. 前端UI设计

#### 3.1 简化的标签页组件

```tsx
import React, { useState, useEffect } from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';
import styled from 'styled-components';

const TabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabsHeader = styled.div`
  display: flex;
  background-color: var(--vscode-editorGroupHeader-tabsBackground);
  border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder);
`;

const TabButton = styled.button<{ isActive: boolean }>`
  background: ${props => props.isActive ? 'var(--vscode-tab-activeBackground)' : 'var(--vscode-tab-inactiveBackground)'};
  color: ${props => props.isActive ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)'};
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  border-bottom: 2px solid ${props => props.isActive ? 'var(--vscode-focusBorder)' : 'transparent'};
  &:hover {
    background: var(--vscode-tab-hoverBackground);
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow: auto;
`;

export const AgentTabs: React.FC = () => {
  const { clineMessages, coderMessages } = useExtensionState();
  const [selectedTab, setSelectedTab] = useState<'planner' | 'coder'>('planner');
  
  // 自动切换到有内容的标签页
  useEffect(() => {
    if (selectedTab === 'planner' && clineMessages.length === 0 && coderMessages.length > 0) {
      setSelectedTab('coder');
    } else if (selectedTab === 'coder' && coderMessages.length === 0 && clineMessages.length > 0) {
      setSelectedTab('planner');
    }
  }, [clineMessages, coderMessages, selectedTab]);
  
  // 获取当前标签页的消息
  const currentMessages = selectedTab === 'planner' ? clineMessages : coderMessages;
  
  // 只有在coderMessages不为空时才显示标签页
  const showTabs = coderMessages.length > 0;
  
  if (!showTabs) {
    // 如果coder没有消息，直接显示planner消息
    return <ChatView messages={clineMessages} />;
  }
  
  return (
    <TabsContainer>
      <TabsHeader>
        <TabButton 
          isActive={selectedTab === 'planner'}
          onClick={() => setSelectedTab('planner')}
        >
          Planner
        </TabButton>
        <TabButton
          isActive={selectedTab === 'coder'}
          onClick={() => setSelectedTab('coder')}
        >
          Coder
        </TabButton>
      </TabsHeader>
      <TabContent>
        <ChatView messages={currentMessages} />
      </TabContent>
    </TabsContainer>
  );
};
```

#### 3.2 ChatApp组件修改

```tsx
// 修改现有的ChatApp组件
const ChatApp: React.FC = () => {
  // 现有代码...
  
  return (
    <Container>
      <TabNavbar 
        onPlusClick={handlePlusClick} 
        onHistoryClick={handleHistoryClick} 
        onSettingsClick={handleSettingsClick} 
      />
      <ContentContainer>
        {showSettings ? (
          <Settings onClose={() => setShowSettings(false)} />
        ) : showHistory ? (
          <HistoryView onClose={() => setShowHistory(false)} />
        ) : (
          <AgentTabs /> // 使用AgentTabs替换原来的ChatView
        )}
      </ContentContainer>
    </Container>
  );
};
```

### 4. 创建Coder功能实现

在 Cline 类的 `create_coder_agent` 工具处理中的 `if (approved) {}` 部分添加创建 coder 智能体的实现：

```typescript
// 在if (approved) {}内部添加以下代码
if (approved) {
  try {
    // 格式化任务描述，整合三个参数
    const formattedTask = formatCoderTask(task_description, code_style, requirements);
    
    // 获取ClineProvider实例
    const provider = this.providerRef.deref();
    if (!provider) {
      throw new Error("无法获取ClineProvider实例");
    }
    
    // 创建coder智能体
    const coderAgentId = await provider.createCoderAgent(formattedTask);
    
    // 发送成功消息
    const successMessage = `已成功创建代码智能体（ID: ${coderAgentId}）。该智能体将在新标签页中显示。`;
    await this.say("text", successMessage);
    
    // 将工具结果添加到用户消息内容
    userMessageContent.push({
      type: "text",
      text: successMessage,
    });
    
    // 通知用户界面刷新状态
    await provider.postStateToWebview();
  } catch (error) {
    // 错误处理
    const errorMessage = `创建代码智能体失败: ${error instanceof Error ? error.message : String(error)}`;
    await this.say("error", errorMessage);
    userMessageContent.push({
      type: "text",
      text: formatResponse.toolError(errorMessage),
    });
  }
}
```

添加辅助函数用于格式化任务：

```typescript
// 在Cline类中添加辅助函数，格式化coder任务
function formatCoderTask(taskDescription: string, codeStyle: string, requirements: string): string {
  return `# 代码任务
  
## 任务描述
${taskDescription}

## 代码风格要求
${codeStyle}

## 技术要求
${requirements}

请按照以上要求完成任务。`;
}
```

## 实现步骤

1. **修改Cline类**:
   - 在 `create_coder_agent` 工具的 `if (approved) {}` 部分实现创建代码智能体的逻辑
   - 添加 `formatCoderTask` 辅助函数格式化任务描述
   - 在获得批准后通知UI更新状态

2. **更新ClineProvider**:
   - 添加coder属性
   - 实现createCoderAgent方法，接收格式化后的任务
   - 修改getStateToPostToWebview方法以包含coder消息

3. **前端UI改造**:
   - 创建AgentTabs组件
   - 修改ChatApp组件以使用AgentTabs
   - 根据coderMessages是否为空决定是否显示标签页

## 技术挑战与解决方案

1. **流式输出处理**: 利用现有的流式输出机制处理部分参数情况，保持用户体验流畅

2. **批准机制集成**: 保留自动批准机制，并在获得批准后立即创建coder智能体

3. **任务格式化**: 将三个参数（任务描述、代码风格、需求）合并成结构化格式，便于coder智能体理解

4. **最小化改动**: 保持现有架构基本不变，只在必要部分添加新功能

## 后续优化方向

1. 增加对多个Coder实例的支持
2. 完善标签页设计，添加更多交互功能
3. 添加对更多类型智能体的支持
