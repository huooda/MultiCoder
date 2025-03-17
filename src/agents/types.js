/**
 * 智能体类型枚举
 */
export var AgentType;
(function (AgentType) {
    AgentType["Planner"] = "planner";
    AgentType["Coder"] = "coder";
    AgentType["User"] = "user";
})(AgentType || (AgentType = {}));
/**
 * 消息类型枚举
 */
export var MessageType;
(function (MessageType) {
    MessageType["Task"] = "task";
    MessageType["TaskComplete"] = "task_complete";
    MessageType["Status"] = "status";
    MessageType["Error"] = "error";
})(MessageType || (MessageType = {}));
/**
 * 任务类型枚举
 */
export var TaskType;
(function (TaskType) {
    TaskType["UserRequest"] = "user_request";
    TaskType["CodeImplementation"] = "code_implementation";
})(TaskType || (TaskType = {}));
//# sourceMappingURL=types.js.map