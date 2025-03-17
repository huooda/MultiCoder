import { PostHog } from "posthog-node";
import * as vscode from "vscode";
import { version as extensionVersion } from "../../../package.json";
/**
 * PostHogClient handles telemetry event tracking for the Cline extension
 * Uses PostHog analytics to track user interactions and system events
 * Respects user privacy settings and VSCode's global telemetry configuration
 */
class PostHogClient {
    // Event constants for tracking user interactions and system events
    static EVENTS = {
        // Task-related events for tracking conversation and execution flow
        TASK: {
            // Tracks when a new task/conversation is started
            CREATED: "task.created",
            // Tracks when a task is reopened
            RESTARTED: "task.restarted",
            // Tracks when a task is finished, with acceptance or rejection status
            COMPLETED: "task.completed",
            // Tracks when a message is sent in a conversation
            CONVERSATION_TURN: "task.conversation_turn",
            // Tracks token consumption for cost and usage analysis
            TOKEN_USAGE: "task.tokens",
            // Tracks switches between plan and act modes
            MODE_SWITCH: "task.mode",
            // Tracks usage of the git-based checkpoint system (shadow_git_initialized, commit_created, branch_created, branch_deleted_active, branch_deleted_inactive, restored)
            CHECKPOINT_USED: "task.checkpoint_used",
            // Tracks when tools (like file operations, commands) are used
            TOOL_USED: "task.tool_used",
            // Tracks when a historical task is loaded from storage
            HISTORICAL_LOADED: "task.historical_loaded",
            // Tracks when the retry button is clicked for failed operations
            RETRY_CLICKED: "task.retry_clicked",
        },
        // UI interaction events for tracking user engagement
        UI: {
            // Tracks when user switches between API providers
            PROVIDER_SWITCH: "ui.provider_switch",
            // Tracks when images are attached to a conversation
            IMAGE_ATTACHED: "ui.image_attached",
            // Tracks general button click interactions
            BUTTON_CLICK: "ui.button_click",
            // Tracks when the marketplace view is opened
            MARKETPLACE_OPENED: "ui.marketplace_opened",
            // Tracks when settings panel is opened
            SETTINGS_OPENED: "ui.settings_opened",
            // Tracks when task history view is opened
            HISTORY_OPENED: "ui.history_opened",
            // Tracks when a task is removed from history
            TASK_POPPED: "ui.task_popped",
            // Tracks when a different model is selected
            MODEL_SELECTED: "ui.model_selected",
            // Tracks when planning mode is toggled on
            PLAN_MODE_TOGGLED: "ui.plan_mode_toggled",
            // Tracks when action mode is toggled on
            ACT_MODE_TOGGLED: "ui.act_mode_toggled",
        },
    };
    /** Singleton instance of the PostHogClient */
    static instance;
    /** PostHog client instance for sending analytics events */
    client;
    /** Unique identifier for the current VSCode instance */
    distinctId = vscode.env.machineId;
    /** Whether telemetry is currently enabled based on user and VSCode settings */
    telemetryEnabled = false;
    /** Current version of the extension */
    version = extensionVersion;
    /**
     * Private constructor to enforce singleton pattern
     * Initializes PostHog client with configuration
     */
    constructor() {
        this.client = new PostHog("phc_qfOAGxZw2TL5O8p9KYd9ak3bPBFzfjC8fy5L6jNWY7K", {
            host: "https://us.i.posthog.com",
            enableExceptionAutocapture: false,
        });
    }
    /**
     * Updates the telemetry state based on user preferences and VSCode settings
     * Only enables telemetry if both VSCode global telemetry is enabled and user has opted in
     * @param didUserOptIn Whether the user has explicitly opted into telemetry
     */
    updateTelemetryState(didUserOptIn) {
        this.telemetryEnabled = false;
        // First check global telemetry level - telemetry should only be enabled when level is "all"
        const telemetryLevel = vscode.workspace.getConfiguration("telemetry").get("telemetryLevel", "all");
        const globalTelemetryEnabled = telemetryLevel === "all";
        // We only enable telemetry if global vscode telemetry is enabled
        if (globalTelemetryEnabled) {
            this.telemetryEnabled = didUserOptIn;
        }
        // Update PostHog client state based on telemetry preference
        if (this.telemetryEnabled) {
            this.client.optIn();
        }
        else {
            this.client.optOut();
        }
    }
    /**
     * Gets or creates the singleton instance of PostHogClient
     * @returns The PostHogClient instance
     */
    static getInstance() {
        if (!PostHogClient.instance) {
            PostHogClient.instance = new PostHogClient();
        }
        return PostHogClient.instance;
    }
    /**
     * Captures a telemetry event if telemetry is enabled
     * @param event The event to capture with its properties
     */
    capture(event) {
        // Only send events if telemetry is enabled
        if (this.telemetryEnabled) {
            // Include extension version in all event properties
            const propertiesWithVersion = {
                ...event.properties,
                extension_version: this.version,
            };
            this.client.capture({ distinctId: this.distinctId, event: event.event, properties: propertiesWithVersion });
        }
    }
    // Task events
    /**
     * Records when a new task/conversation is started
     * @param taskId Unique identifier for the new task
     */
    captureTaskCreated(taskId, apiProvider) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.CREATED,
            properties: { taskId, apiProvider },
        });
    }
    /**
     * Records when a task/conversation is restarted
     * @param taskId Unique identifier for the new task
     */
    captureTaskRestarted(taskId, apiProvider) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.RESTARTED,
            properties: { taskId, apiProvider },
        });
    }
    /**
     * Records when cline calls the task completion_result tool signifying that cline is done with the task
     * @param taskId Unique identifier for the task
     */
    captureTaskCompleted(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.COMPLETED,
            properties: { taskId },
        });
    }
    /**
     * Captures that a message was sent, and includes the API provider and model used
     * @param taskId Unique identifier for the task
     * @param provider The API provider (e.g., OpenAI, Anthropic)
     * @param model The specific model used (e.g., GPT-4, Claude)
     * @param source The source of the message ("user" | "model"). Used to track message patterns and identify when users need to correct the model's responses.
     */
    captureConversationTurnEvent(taskId, provider = "unknown", model = "unknown", source) {
        // Ensure required parameters are provided
        if (!taskId || !provider || !model || !source) {
            console.warn("TelemetryService: Missing required parameters for message capture");
            return;
        }
        const properties = {
            taskId,
            provider,
            model,
            source,
            timestamp: new Date().toISOString(), // Add timestamp for message sequencing
        };
        this.capture({
            event: PostHogClient.EVENTS.TASK.CONVERSATION_TURN,
            properties,
        });
    }
    /**
     * TODO
     * Records token usage metrics for cost tracking and usage analysis
     * @param taskId Unique identifier for the task
     * @param tokensIn Number of input tokens consumed
     * @param tokensOut Number of output tokens generated
     * @param model The model used for token calculation
     */
    captureTokenUsage(taskId, tokensIn, tokensOut, model) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.TOKEN_USAGE,
            properties: {
                taskId,
                tokensIn,
                tokensOut,
                model,
            },
        });
    }
    /**
     * Records when a task switches between plan and act modes
     * @param taskId Unique identifier for the task
     * @param mode The mode being switched to (plan or act)
     */
    captureModeSwitch(taskId, mode) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.MODE_SWITCH,
            properties: {
                taskId,
                mode,
            },
        });
    }
    // Tool events
    /**
     * Records when a tool is used during task execution
     * @param taskId Unique identifier for the task
     * @param tool Name of the tool being used
     * @param autoApproved Whether the tool was auto-approved based on settings
     * @param success Whether the tool execution was successful
     */
    captureToolUsage(taskId, tool, autoApproved, success) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.TOOL_USED,
            properties: {
                taskId,
                tool,
                autoApproved,
                success,
            },
        });
    }
    /**
     * Records interactions with the git-based checkpoint system
     * @param taskId Unique identifier for the task
     * @param action The type of checkpoint action
     * @param durationMs Optional duration of the operation in milliseconds
     */
    captureCheckpointUsage(taskId, action, durationMs) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.CHECKPOINT_USED,
            properties: {
                taskId,
                action,
                durationMs,
            },
        });
    }
    // UI events
    /**
     * Records when the user switches between different API providers
     * @param from Previous provider name
     * @param to New provider name
     * @param location Where the switch occurred (settings panel or bottom bar)
     * @param taskId Optional task identifier if switch occurred during a task
     */
    captureProviderSwitch(from, to, location, taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.PROVIDER_SWITCH,
            properties: {
                from,
                to,
                location,
                taskId,
            },
        });
    }
    /**
     * Records when images are attached to a conversation
     * @param taskId Unique identifier for the task
     * @param imageCount Number of images attached
     */
    captureImageAttached(taskId, imageCount) {
        this.capture({
            event: PostHogClient.EVENTS.UI.IMAGE_ATTACHED,
            properties: {
                taskId,
                imageCount,
            },
        });
    }
    /**
     * Records general button click interactions in the UI
     * @param button Identifier for the button that was clicked
     * @param taskId Optional task identifier if click occurred during a task
     */
    captureButtonClick(button, taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.BUTTON_CLICK,
            properties: {
                button,
                taskId,
            },
        });
    }
    /**
     * Records when the marketplace view is opened
     * @param taskId Optional task identifier if marketplace was opened during a task
     */
    captureMarketplaceOpened(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.MARKETPLACE_OPENED,
            properties: {
                taskId,
            },
        });
    }
    /**
     * Records when the settings panel is opened
     * @param taskId Optional task identifier if settings were opened during a task
     */
    captureSettingsOpened(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.SETTINGS_OPENED,
            properties: {
                taskId,
            },
        });
    }
    /**
     * Records when the task history view is opened
     * @param taskId Optional task identifier if history was opened during a task
     */
    captureHistoryOpened(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.HISTORY_OPENED,
            properties: {
                taskId,
            },
        });
    }
    /**
     * Records when a task is removed from the task history
     * @param taskId Unique identifier for the task being removed
     */
    captureTaskPopped(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.TASK_POPPED,
            properties: {
                taskId,
            },
        });
    }
    /**
     * Records when a different model is selected for use
     * @param model Name of the selected model
     * @param provider Provider of the selected model
     * @param taskId Optional task identifier if model was selected during a task
     */
    captureModelSelected(model, provider, taskId) {
        this.capture({
            event: PostHogClient.EVENTS.UI.MODEL_SELECTED,
            properties: {
                model,
                provider,
                taskId,
            },
        });
    }
    /**
     * Records when a historical task is loaded from storage
     * @param taskId Unique identifier for the historical task
     */
    captureHistoricalTaskLoaded(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.HISTORICAL_LOADED,
            properties: {
                taskId,
            },
        });
    }
    /**
     * Records when the retry button is clicked for failed operations
     * @param taskId Unique identifier for the task being retried
     */
    captureRetryClicked(taskId) {
        this.capture({
            event: PostHogClient.EVENTS.TASK.RETRY_CLICKED,
            properties: {
                taskId,
            },
        });
    }
    isTelemetryEnabled() {
        return this.telemetryEnabled;
    }
    async shutdown() {
        await this.client.shutdown();
    }
}
export const telemetryService = PostHogClient.getInstance();
//# sourceMappingURL=TelemetryService.js.map