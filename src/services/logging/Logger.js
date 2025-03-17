/**
 * Simple logging utility for the extension's backend code.
 * Uses VS Code's OutputChannel which must be initialized from extension.ts
 * to ensure proper registration with the extension context.
 */
export class Logger {
    static outputChannel;
    static initialize(outputChannel) {
        Logger.outputChannel = outputChannel;
    }
    static log(message) {
        Logger.outputChannel.appendLine(message);
    }
}
//# sourceMappingURL=Logger.js.map