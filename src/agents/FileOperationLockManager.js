/**
 * 文件操作锁管理器
 * 用于在多智能体环境中避免文件访问冲突
 */
export class FileOperationLockManager {
    static instance;
    // 文件锁映射：文件路径 -> 智能体ID
    fileLocks = new Map();
    // 等待队列：文件路径 -> 等待智能体ID数组
    waitingQueue = new Map();
    constructor() {
        // 私有构造函数，确保单例模式
        console.log('[FileOperationLockManager] 已初始化');
    }
    /**
     * 获取FileOperationLockManager单例
     */
    static getInstance() {
        if (!FileOperationLockManager.instance) {
            FileOperationLockManager.instance = new FileOperationLockManager();
        }
        return FileOperationLockManager.instance;
    }
    /**
     * 尝试获取文件锁
     * @param filePath 文件路径
     * @param agentId 智能体ID
     * @returns 是否成功获取锁
     */
    acquireLock(filePath, agentId) {
        // 检查文件是否已被锁定
        if (this.fileLocks.has(filePath)) {
            const lockingAgentId = this.fileLocks.get(filePath);
            // 如果已经被同一个智能体锁定，直接返回成功
            if (lockingAgentId === agentId) {
                return true;
            }
            // 否则，将请求加入等待队列
            let waitingAgents = this.waitingQueue.get(filePath) || [];
            if (!waitingAgents.includes(agentId)) {
                waitingAgents.push(agentId);
                this.waitingQueue.set(filePath, waitingAgents);
                console.log(`[FileOperationLockManager] 智能体 ${agentId} 正在等待 ${filePath} 的锁`);
            }
            return false;
        }
        // 如果文件未被锁定，则锁定该文件
        this.fileLocks.set(filePath, agentId);
        console.log(`[FileOperationLockManager] 智能体 ${agentId} 获得了 ${filePath} 的锁`);
        return true;
    }
    /**
     * 释放文件锁
     * @param filePath 文件路径
     * @param agentId 智能体ID
     */
    releaseLock(filePath, agentId) {
        // 检查当前锁是否属于该智能体
        if (this.fileLocks.get(filePath) !== agentId) {
            console.warn(`[FileOperationLockManager] 智能体 ${agentId} 尝试释放不属于它的锁 ${filePath}`);
            return;
        }
        // 释放锁
        this.fileLocks.delete(filePath);
        console.log(`[FileOperationLockManager] 智能体 ${agentId} 释放了 ${filePath} 的锁`);
        // 检查等待队列
        const waitingAgents = this.waitingQueue.get(filePath);
        if (waitingAgents && waitingAgents.length > 0) {
            // 将锁分配给队列中的第一个智能体
            const nextAgentId = waitingAgents.shift();
            this.waitingQueue.set(filePath, waitingAgents);
            if (nextAgentId) {
                this.fileLocks.set(filePath, nextAgentId);
                console.log(`[FileOperationLockManager] 智能体 ${nextAgentId} 从等待队列获得了 ${filePath} 的锁`);
            }
        }
    }
    /**
     * 检查文件是否被锁定
     * @param filePath 文件路径
     * @returns 是否被锁定
     */
    isLocked(filePath) {
        return this.fileLocks.has(filePath);
    }
    /**
     * 获取持有文件锁的智能体ID
     * @param filePath 文件路径
     * @returns 智能体ID或undefined
     */
    getLockingAgent(filePath) {
        return this.fileLocks.get(filePath);
    }
    /**
     * 获取智能体在等待队列中的位置
     * @param filePath 文件路径
     * @param agentId 智能体ID
     * @returns 位置索引（-1表示不在队列中）
     */
    getWaitingPosition(filePath, agentId) {
        const waitingAgents = this.waitingQueue.get(filePath);
        if (!waitingAgents) {
            return -1;
        }
        return waitingAgents.indexOf(agentId);
    }
    /**
     * 清除所有锁
     * 用于系统重置或紧急情况
     */
    clearAllLocks() {
        this.fileLocks.clear();
        this.waitingQueue.clear();
        console.log('[FileOperationLockManager] 已清除所有文件锁');
    }
}
//# sourceMappingURL=FileOperationLockManager.js.map