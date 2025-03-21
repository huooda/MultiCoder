import React, { useState, useEffect } from 'react';
import { useExtensionState } from '../../context/ExtensionStateContext';
import styled from 'styled-components';
import ChatView from './ChatView';

const TabsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabsHeader = styled.div`
  display: flex;
  background-color: var(--vscode-editorGroupHeader-tabsBackground);
  border-bottom: 1px solid var(--vscode-editorGroupHeader-tabsBorder);
`;

const TabButton = styled.button<{ isActive: boolean }>`
  background: ${props => props.isActive ? 'var(--vscode-tab-activeBackground)' : 'var(--vscode-tab-inactiveBackground)'};
  color: ${props => props.isActive ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)'};
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  border-bottom: 2px solid ${props => props.isActive ? 'var(--vscode-focusBorder)' : 'transparent'};
  &:hover {
    background: var(--vscode-tab-hoverBackground);
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow: auto;
`;

export interface AgentTabsProps {
  showHistoryView?: () => void;
  showAnnouncement?: boolean;
  setShowAnnouncement?: React.Dispatch<React.SetStateAction<boolean>>;
}

const AgentTabs: React.FC<AgentTabsProps> = (props) => {
  const { clineMessages, coderMessages } = useExtensionState();
  const [selectedTab, setSelectedTab] = useState<'planner' | 'coder'>('planner');
  
  // 自动切换到有内容的标签页
  useEffect(() => {
    if (selectedTab === 'planner' && clineMessages.length === 0 && coderMessages.length > 0) {
      setSelectedTab('coder');
    } else if (selectedTab === 'coder' && coderMessages.length === 0 && clineMessages.length > 0) {
      setSelectedTab('planner');
    }
  }, [clineMessages, coderMessages, selectedTab]);
  
  // 获取当前标签页的消息
  const currentMessages = selectedTab === 'planner' ? clineMessages : coderMessages;
  
  // 只有在coderMessages不为空时才显示标签页
  const showTabs = coderMessages.length > 0;
  
  if (!showTabs) {
    // 如果coder没有消息，直接显示planner消息
    return (
      <ChatView 
        messages={clineMessages} 
        showHistoryView={props.showHistoryView}
        showAnnouncement={props.showAnnouncement}
        setShowAnnouncement={props.setShowAnnouncement}
      />
    );
  }
  
  return (
    <TabsContainer>
      <TabsHeader>
        <TabButton 
          isActive={selectedTab === 'planner'}
          onClick={() => setSelectedTab('planner')}
        >
          Planner
        </TabButton>
        <TabButton
          isActive={selectedTab === 'coder'}
          onClick={() => setSelectedTab('coder')}
        >
          Coder
        </TabButton>
      </TabsHeader>
      <TabContent>
        <ChatView 
          messages={currentMessages}
          showHistoryView={props.showHistoryView}
          showAnnouncement={props.showAnnouncement}
          setShowAnnouncement={props.setShowAnnouncement}
        />
      </TabContent>
    </TabsContainer>
  );
};

export default AgentTabs; 