import React, { useState, useEffect } from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';
import styled from 'styled-components';
import ChatView from './ChatView';

const TabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
`;

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
`;

const TabButton = styled.button<{ isActive: boolean }>`
  background: ${props => props.isActive ? 'var(--vscode-tab-activeBackground)' : 'var(--vscode-tab-inactiveBackground)'};
  color: ${props => props.isActive ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)'};
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  border-bottom: 2px solid ${props => props.isActive ? 'var(--vscode-focusBorder)' : 'transparent'};
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
`;

const TabContent = styled.div`
  flex: 1;
  overflow: auto;
  position: relative;
`;

// 智能体图标
const AgentIcon = styled.span`
  margin-right: 6px;
  font-size: 14px;
`;

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
`;

export interface AgentTabsProps {
  showHistoryView?: () => void;
  showAnnouncement?: boolean;
  hideAnnouncement?: () => void;
}

// 智能体类型定义
interface AgentTab {
  id: string;
  name: string;
  type: 'planner' | 'coder';
  icon: string;
  messageCount: number;
}

const AgentTabs: React.FC<AgentTabsProps> = (props) => {
  const extensionState = useExtensionState();
  const { clineMessages, coderMessages } = extensionState;
  const [selectedTabId, setSelectedTabId] = useState<'planner' | 'coder'>('planner');
  
  // 添加调试输出
  useEffect(() => {
    console.log('ExtensionState:', {
      selectedTab: selectedTabId,
      clineMessagesCount: clineMessages.length,
      coderMessagesCount: coderMessages.length,
      fullState: extensionState
    });
  }, [selectedTabId, clineMessages, coderMessages, extensionState]);
  
  // 固定的标签页配置
  const tabs: AgentTab[] = [
    { 
      id: 'planner', 
      name: 'Planner', 
      type: 'planner', 
      icon: '🧠',
      messageCount: clineMessages.length
    },
    { 
      id: 'coder', 
      name: 'Coder', 
      type: 'coder', 
      icon: '💻',
      messageCount: coderMessages.length
    }
  ];
  
  // 自动切换到有内容的标签页
  useEffect(() => {
    if (selectedTabId === 'planner' && clineMessages.length === 0 && coderMessages.length > 0) {
      setSelectedTabId('coder');
    } else if (selectedTabId === 'coder' && coderMessages.length === 0 && clineMessages.length > 0) {
      setSelectedTabId('planner');
    }
  }, [clineMessages, coderMessages, selectedTabId]);
  
  // 提供默认值，确保类型匹配
  const showHistoryView = props.showHistoryView || (() => {});
  const showAnnouncement = props.showAnnouncement || false;
  const hideAnnouncement = props.hideAnnouncement || (() => {});
  
  return (
    <TabsContainer>
      <TabsHeader>
        {tabs.map(tab => (
          <TabButton 
            key={tab.id}
            isActive={selectedTabId === tab.id}
            onClick={() => setSelectedTabId(tab.id as 'planner' | 'coder')}
          >
            <AgentIcon>{tab.icon}</AgentIcon>
            {tab.name}
            {tab.messageCount > 0 && (
              <MessageCount>{tab.messageCount}</MessageCount>
            )}
          </TabButton>
        ))}
      </TabsHeader>
      <TabContent>
        <ChatView 
          isHidden={false}
          showHistoryView={showHistoryView}
          showAnnouncement={showAnnouncement}
          hideAnnouncement={hideAnnouncement}
          messageSource={selectedTabId}
        />
      </TabContent>
    </TabsContainer>
  );
};

export default AgentTabs; 