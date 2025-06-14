export type HistoryItem = {
	id: string
	ts: number
	task: string
	tokensIn: number
	tokensOut: number
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	agentType?: string
	agents?: string[]
	size?: number
	shadowGitConfigWorkTree?: string
	conversationHistoryDeletedRange?: [number, number]
}
