import * as vscode from "vscode";
import { buildApiHandler } from "../api";
import CheckpointTracker from "../integrations/checkpoints/CheckpointTracker";
import { CoderAgent } from "./CoderAgent";
import { PlannerAgent } from "./PlannerAgent";
import { MessageType } from "./types";
import { DEFAULT_BROWSER_SETTINGS } from "../shared/BrowserSettings";
import { PLANNER_AGENT_PROMPT } from "../core/prompts/planner_agent";
import { CODER_AGENT_PROMPT } from "../core/prompts/coder_agent";
import { Cline } from "../core/Cline";
import { ClineProvider } from "../core/webview/ClineProvider";
/**
 * 智能体管理器
 * 负责创建、获取和销毁智能体
 */
export class AgentManager {
    static instance;
    // 智能体集合，用ID作为键
    agents = new Map();
    // 事件发射器，用于智能体间通信
    eventEmitter = new vscode.EventEmitter();
    // API配置和处理器
    apiConfiguration;
    apiHandler;
    // 检查点跟踪器
    checkpointTracker;
    // 浏览器设置
    browserSettings = DEFAULT_BROWSER_SETTINGS;
    // 当前工作目录
    cwd = "";
    // 初始化状态
    isInitialized = false;
    constructor() {
        // 私有构造函数，确保单例模式
        // 注册事件处理器
        this.eventEmitter.event(message => {
            this.handleAgentMessage(message);
        });
    }
    /**
     * 获取AgentManager单例
     */
    static getInstance() {
        if (!AgentManager.instance) {
            AgentManager.instance = new AgentManager();
        }
        return AgentManager.instance;
    }
    /**
     * 初始化AgentManager
     */
    initialize(context, apiConfiguration, browserSettings = DEFAULT_BROWSER_SETTINGS) {
        // 保存API配置
        this.apiConfiguration = apiConfiguration;
        // 保存浏览器设置
        this.browserSettings = browserSettings;
        // 创建API处理器
        this.apiHandler = buildApiHandler(apiConfiguration);
        // 设置当前工作目录
        this.cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? "";
        // 创建检查点跟踪器
        CheckpointTracker.create("agent-manager", context.globalStorageUri.fsPath)
            .then(tracker => {
            this.checkpointTracker = tracker;
            console.log('[AgentManager] 检查点跟踪器初始化完成');
            this.isInitialized = true;
        })
            .catch(error => {
            console.error('[AgentManager] 检查点跟踪器初始化失败:', error);
        });
        // 注册事件监听器
        context.subscriptions.push(this.eventEmitter.event(message => {
            this.handleAgentMessage(message);
        }));
        console.log('[AgentManager] 初始化完成');
    }
    /**
     * 获取提示词模板
     */
    async getPlannerSystemPrompt() {
        try {
            return await PLANNER_AGENT_PROMPT(this.cwd, this.browserSettings);
        }
        catch (error) {
            console.error('[AgentManager] 获取计划智能体提示词失败:', error);
            throw new Error('获取计划智能体提示词失败');
        }
    }
    /**
     * 获取代码智能体提示词模板
     */
    async getCoderSystemPrompt() {
        try {
            return await CODER_AGENT_PROMPT(this.cwd, this.browserSettings);
        }
        catch (error) {
            console.error('[AgentManager] 获取代码智能体提示词失败:', error);
            throw new Error('获取代码智能体提示词失败');
        }
    }
    /**
     * 创建计划智能体
     */
    async createPlannerAgent() {
        if (!this.apiHandler || !this.checkpointTracker) {
            throw new Error('AgentManager未初始化，无法创建智能体');
        }
        const plannerAgent = new PlannerAgent(this.apiHandler, this.checkpointTracker, this.eventEmitter);
        // 设置系统提示词
        const systemPrompt = await this.getPlannerSystemPrompt();
        await plannerAgent.setSystemPrompt(systemPrompt);
        const agentId = plannerAgent.getId();
        this.agents.set(agentId, plannerAgent);
        console.log(`[AgentManager] 创建了计划智能体 (ID: ${agentId.substring(0, 8)})`);
        return agentId;
    }
    /**
     * 创建代码智能体
     */
    async createCoderAgent(params) {
        if (!this.apiHandler || !this.checkpointTracker) {
            throw new Error('AgentManager未初始化，无法创建智能体');
        }
        const { plannerAgentId, taskSpec } = params;
        // 检查计划智能体是否存在
        if (!this.agents.has(plannerAgentId)) {
            throw new Error(`未找到指定的计划智能体 (ID: ${plannerAgentId})`);
        }
        const coderAgent = new CoderAgent(this.apiHandler, this.checkpointTracker, this.eventEmitter, plannerAgentId, taskSpec);
        // 设置系统提示词
        const systemPrompt = await this.getCoderSystemPrompt();
        await coderAgent.setSystemPrompt(systemPrompt);
        const agentId = coderAgent.getId();
        this.agents.set(agentId, coderAgent);
        console.log(`[AgentManager] 创建了代码智能体 (ID: ${agentId.substring(0, 8)})`);
        return agentId;
    }
    /**
     * 获取计划智能体
     * 如果不存在则创建一个新的
     */
    async getPlannerAgent() {
        // 查找已存在的计划智能体
        for (const [id, agent] of this.agents.entries()) {
            if (agent instanceof PlannerAgent) {
                return agent;
            }
        }
        // 如果不存在，创建一个新的
        const agentId = await this.createPlannerAgent();
        return this.agents.get(agentId);
    }
    /**
     * 获取代码智能体
     */
    getCoderAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (agent && agent instanceof CoderAgent) {
            return agent;
        }
        return undefined;
    }
    /**
     * 处理用户消息
     */
    async handleUserMessage(content) {
        // 获取计划智能体
        const plannerAgent = await this.getPlannerAgent();
        // 创建用户任务
        const task = {
            id: `task-${Date.now()}`,
            type: 'user_request',
            content,
            timestamp: Date.now()
        };
        // 将任务分配给计划智能体
        await plannerAgent.processTask(task);
    }
    /**
     * 处理智能体间消息
     */
    handleAgentMessage(message) {
        console.log(`[AgentManager] 收到消息: ${message.from} -> ${message.to}, 类型: ${message.type}`);
        // 处理消息
        const targetAgent = this.agents.get(message.to);
        if (!targetAgent) {
            console.error(`[AgentManager] 未找到目标智能体 (ID: ${message.to})`);
            return;
        }
        // 根据消息类型处理
        if (message.type === MessageType.TaskComplete && targetAgent instanceof PlannerAgent) {
            targetAgent.handleCoderAgentCompletion(message);
        }
    }
    /**
     * 创建Cline智能体实例
     * 将Cline纳入统一管理
     */
    async createClineAgent(context, apiConfiguration, autoApprovalSettings, browserSettings = DEFAULT_BROWSER_SETTINGS, chatSettings, customInstructions, task, images) {
        if (!this.apiHandler || !this.checkpointTracker) {
            throw new Error('AgentManager未初始化，无法创建智能体');
        }
        // 创建输出通道
        const outputChannel = vscode.window.createOutputChannel(`Cline Agent (${Date.now()})`);
        // 创建Cline提供者和实例
        const clineProvider = new ClineProvider(context, outputChannel);
        const cline = new Cline(clineProvider, apiConfiguration, autoApprovalSettings, browserSettings, chatSettings, customInstructions, task, images);
        // 使用任务ID作为智能体ID
        const agentId = cline.taskId;
        // 将Cline实例注册到智能体管理
        // 注意：Cline不是BaseAgent的子类，但我们仍在同一集合中管理它
        // 这里使用类型断言，实际使用时需要区分处理
        this.agents.set(agentId, cline);
        console.log(`[AgentManager] 创建了Cline智能体 (ID: ${agentId.substring(0, 8)})`);
        // 如果提供了任务，则启动该任务
        if (task) {
            Promise.resolve().then(async () => {
                try {
                    await cline.startTask(task, images);
                    console.log(`[AgentManager] Cline智能体 ${agentId.substring(0, 8)} 已自动启动任务`);
                }
                catch (error) {
                    console.error(`[AgentManager] 启动任务时出错:`, error);
                }
            });
        }
        return cline;
    }
    /**
     * 在独立线程中运行智能体任务
     * @param agentId 智能体ID
     * @param taskContent 任务内容
     * @param images 可选的图片数组
     */
    runAgentInSeparateThread(agentId, taskContent, images) {
        // 获取智能体
        const agent = this.agents.get(agentId);
        if (!agent) {
            console.error(`[AgentManager] 未找到智能体 (ID: ${agentId})`);
            return;
        }
        // 创建任务
        const task = {
            id: `task-${Date.now()}`,
            type: 'user_request',
            content: taskContent,
            timestamp: Date.now()
        };
        // 在独立Promise中异步运行任务
        Promise.resolve().then(async () => {
            try {
                // 如果是BaseAgent的实例，调用processTask
                if ('processTask' in agent) {
                    const result = await agent.processTask(task);
                    console.log(`[AgentManager] 智能体 ${agentId} 任务执行结果:`, result);
                }
                // 如果是Cline实例，直接调用startTask
                else if ('startTask' in agent && typeof agent.startTask === 'function') {
                    await agent.startTask(taskContent, images);
                    console.log(`[AgentManager] Cline智能体 ${agentId} 已开始执行任务`);
                }
                else {
                    console.error(`[AgentManager] 无法识别的智能体类型:`, agent);
                }
            }
            catch (error) {
                console.error(`[AgentManager] 智能体 ${agentId} 任务执行错误:`, error);
            }
        });
        console.log(`[AgentManager] 已启动智能体 ${agentId} 在独立线程中`);
    }
    /**
     * 获取Cline实例
     */
    getClineAgent(agentId) {
        const agent = this.agents.get(agentId);
        // 检查是否是Cline实例
        if (agent && 'startTask' in agent) {
            return agent;
        }
        return undefined;
    }
}
//# sourceMappingURL=AgentManager.js.map