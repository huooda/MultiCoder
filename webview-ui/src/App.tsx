import { useCallback, useEffect, useState } from "react"
import { useEvent } from "react-use"
import { ExtensionMessage } from "../../src/shared/ExtensionMessage"
import AgentTabs from "./components/chat/AgentTabs"
import HistoryView from "./components/history/HistoryView"
import SettingsView from "./components/settings/SettingsView"
import WelcomeView from "./components/welcome/WelcomeView"
import AccountView from "./components/account/AccountView"
import { ExtensionStateContextProvider, useExtensionState } from "./context/ExtensionStateContext"
import { FirebaseAuthProvider } from "./context/FirebaseAuthContext"
import { vscode } from "./utils/vscode"
import McpView from "./components/mcp/McpView"

const AppContent = () => {
	const { didHydrateState, showWelcome, shouldShowAnnouncement, telemetrySetting, vscMachineId } = useExtensionState()
	const [showSettings, setShowSettings] = useState(false)
	const [showHistory, setShowHistory] = useState(false)
	const [showMcp, setShowMcp] = useState(false)
	const [showAccount, setShowAccount] = useState(false)
	const [showAnnouncement, setShowAnnouncement] = useState(false)

	const handleMessage = useCallback((e: MessageEvent) => {
		const message: ExtensionMessage = e.data
		switch (message.type) {
			case "action":
				switch (message.action!) {
					case "settingsButtonClicked":
						setShowSettings(true)
						setShowHistory(false)
						setShowMcp(false)
						setShowAccount(false)
						break
					case "historyButtonClicked":
						setShowSettings(false)
						setShowHistory(true)
						setShowMcp(false)
						setShowAccount(false)
						break
					case "mcpButtonClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowMcp(true)
						setShowAccount(false)
						break
					case "accountLoginClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowMcp(false)
						setShowAccount(true)
						break
					case "chatButtonClicked":
						setShowSettings(false)
						setShowHistory(false)
						setShowMcp(false)
						setShowAccount(false)
						break
				}
				break
		}
	}, [])

	useEvent("message", handleMessage)

	// useEffect(() => {
	// 	if (telemetrySetting === "enabled") {
	// 		posthog.identify(vscMachineId)
	// 		posthog.opt_in_capturing()
	// 	} else {
	// 		posthog.opt_out_capturing()
	// 	}
	// }, [telemetrySetting, vscMachineId])

	useEffect(() => {
		if (shouldShowAnnouncement) {
			setShowAnnouncement(true)
			vscode.postMessage({ type: "didShowAnnouncement" })
		}
	}, [shouldShowAnnouncement])

	if (!didHydrateState) {
		return null
	}

	// 检查是否有任何其他视图显示
	const isOtherViewShowing = showSettings || showHistory || showMcp || showAccount

	return (
		<>
			{showWelcome ? (
				<WelcomeView />
			) : (
				<>
					{showSettings && <SettingsView onDone={() => setShowSettings(false)} />}
					{showHistory && <HistoryView onDone={() => setShowHistory(false)} />}
					{showMcp && <McpView onDone={() => setShowMcp(false)} />}
					{showAccount && <AccountView onDone={() => setShowAccount(false)} />}
					{/* 虽然我们不想条件性地加载AgentTabs，但当其他视图显示时应该使其不可见 */}
					<div style={{ display: isOtherViewShowing ? "none" : "block" }}>
						<AgentTabs
							showHistoryView={() => {
								setShowSettings(false)
								setShowMcp(false)
								setShowHistory(true)
							}}
							showAnnouncement={showAnnouncement}
							hideAnnouncement={() => setShowAnnouncement(false)}
							isHidden={isOtherViewShowing}
						/>
					</div>
				</>
			)}
		</>
	)
}

const App = () => {
	return (
		<ExtensionStateContextProvider>
			<FirebaseAuthProvider>
				<AppContent />
			</FirebaseAuthProvider>
		</ExtensionStateContextProvider>
	)
}

export default App
