import React, { useState, useEffect } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import styled from "styled-components"
import ChatView from "./ChatView"
import { vscode } from "../../utils/vscode"

// 容器组件，使用flex布局
const TabsContainer = styled.div`
	display: flex;
	flex-direction: column;
	height: 100%;
	position: relative;
`

// 标签头部，固定在顶部
const TabsHeader = styled.div`
	display: flex;
	background-color: var(--vscode-editorGroupHeader-tabsBackground);
	border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder);
	overflow-x: auto;
	scrollbar-width: thin;
	position: sticky;
	top: 0;
	z-index: 100;
	&::-webkit-scrollbar {
		height: 4px;
	}
	&::-webkit-scrollbar-thumb {
		background-color: var(--vscode-scrollbarSlider-background);
	}
`

// 标签按钮
const TabButton = styled.button<{ isActive: boolean }>`
	background: ${(props) => (props.isActive ? "var(--vscode-tab-activeBackground)" : "var(--vscode-tab-inactiveBackground)")};
	color: ${(props) => (props.isActive ? "var(--vscode-tab-activeForeground)" : "var(--vscode-tab-inactiveForeground)")};
	border: none;
	padding: 8px 16px;
	cursor: pointer;
	border-bottom: 2px solid ${(props) => (props.isActive ? "var(--vscode-focusBorder)" : "transparent")};
	white-space: nowrap;
	display: flex;
	align-items: center;
	min-width: 100px;
	justify-content: center;
	position: relative;
	z-index: 101;
	&:hover {
		background: var(--vscode-tab-hoverBackground);
	}
`

// 内容区域
const TabContent = styled.div`
	flex: 1;
	overflow: auto;
	position: relative;
`

// 智能体图标
const AgentIcon = styled.span`
	margin-right: 6px;
	font-size: 14px;
`

// 消息数量标记
const MessageCount = styled.span`
	background-color: var(--vscode-badge-background);
	color: var(--vscode-badge-foreground);
	border-radius: 10px;
	padding: 0 6px;
	font-size: 12px;
	margin-left: 6px;
	min-width: 18px;
	height: 18px;
	display: flex;
	align-items: center;
	justify-content: center;
`

// 组件属性接口
export interface AgentTabsProps {
	showHistoryView?: () => void
	showAnnouncement?: boolean
	hideAnnouncement?: () => void
	isHidden?: boolean
}

// 智能体标签接口
interface AgentTab {
	id: string
	name: string
	type: "planner" | "coder" | "tester"
	icon: string
	messageCount: number
}

const AgentTabs: React.FC<AgentTabsProps> = (props) => {
	const extensionState = useExtensionState()
	const { plannerMessages, coderMessages, testerMessages } = extensionState
	const [selectedTabId, setSelectedTabId] = useState<"planner" | "coder" | "tester">("planner")

	// 调试输出
	useEffect(() => {
		console.log("ExtensionState:", {
			selectedTab: selectedTabId,
			plannerMessagesCount: plannerMessages.length,
			coderMessagesCount: coderMessages.length,
			testerMessagesCount: testerMessages.length,
			fullState: extensionState,
		})
	}, [selectedTabId, plannerMessages, coderMessages, testerMessages, extensionState])

	// 固定的标签页配置
	const tabs: AgentTab[] = [
		{
			id: "planner",
			name: "Planner",
			type: "planner",
			icon: "🧠",
			messageCount: plannerMessages.length,
		},
		{
			id: "coder",
			name: "Coder",
			type: "coder",
			icon: "💻",
			messageCount: coderMessages.length,
		},
		{
			id: "tester",
			name: "Tester",
			type: "tester",
			icon: "🔍",
			messageCount: testerMessages.length,
		},
	]

	// 提供默认值
	const showHistoryView = props.showHistoryView || (() => {})
	const showAnnouncement = props.showAnnouncement || false
	const hideAnnouncement = props.hideAnnouncement || (() => {})

	return (
		<TabsContainer>
			<TabsHeader>
				{tabs.map((tab) => (
					<TabButton
						key={tab.id}
						isActive={selectedTabId === tab.id}
						onClick={() => setSelectedTabId(tab.id as "planner" | "coder" | "tester")}>
						<AgentIcon>{tab.icon}</AgentIcon>
						{tab.name}
						{tab.messageCount > 0 && <MessageCount>{tab.messageCount}</MessageCount>}
					</TabButton>
				))}
			</TabsHeader>
			<TabContent>
				<ChatView
					isHidden={props.isHidden || false}
					showHistoryView={showHistoryView}
					showAnnouncement={showAnnouncement}
					hideAnnouncement={hideAnnouncement}
					messageSource={selectedTabId}
				/>
			</TabContent>
		</TabsContainer>
	)
}

export default AgentTabs
