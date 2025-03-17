import * as vscode from "vscode";
import { buildApiHandler } from "../api";
import CheckpointTracker from "../integrations/checkpoints/CheckpointTracker";
import { CoderAgent } from "./CoderAgent";
import { PlannerAgent } from "./PlannerAgent";
import { MessageType } from "./types";
import { DEFAULT_BROWSER_SETTINGS } from "../shared/BrowserSettings";
import { PLANNER_AGENT_PROMPT } from "../core/prompts/planner_agent";
import { CODER_AGENT_PROMPT } from "../core/prompts/coder_agent";
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
    initialize(context, apiConfiguration) {
        // 保存API配置
        this.apiConfiguration = apiConfiguration;
        // 创建API处理器
        this.apiHandler = buildApiHandler(apiConfiguration);
        // 设置当前工作目录
        this.cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0) ?? "";
        // 创建检查点跟踪器
        CheckpointTracker.create("agent-manager", context.globalStorageUri.fsPath)
            .then(tracker => {
            this.checkpointTracker = tracker;
            console.log('[AgentManager] 检查点跟踪器初始化完成');
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
}
//# sourceMappingURL=AgentManager.js.map