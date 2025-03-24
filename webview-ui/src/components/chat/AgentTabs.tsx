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
  const { clineMessages, coderMessages, coderCreated, agentRelationships } = useExtensionState();
  const [selectedTab, setSelectedTab] = useState<'planner' | 'coder'>('planner');
  
  // 自动切换到有内容的标签页
  useEffect(() => {
    if (selectedTab === 'planner' && clineMessages.length === 0 && coderMessages.length > 0) {
      setSelectedTab('coder');
    } else if (selectedTab === 'coder' && coderMessages.length === 0 && clineMessages.length > 0) {
      setSelectedTab('planner');
    }
  }, [clineMessages, coderMessages, selectedTab]);
  
  // 提供默认值，确保类型匹配
  const showHistoryView = props.showHistoryView || (() => {});
  const showAnnouncement = props.showAnnouncement || false;
  const hideAnnouncement = props.setShowAnnouncement ? () => props.setShowAnnouncement!(false) : () => {};
  
  // 判断是否显示标签页：
  // 1. coderCreated标志为true或
  // 2. 当前任务存在关联的代码智能体ID
  const showTabs = coderCreated === true || 
                  (agentRelationships?.currentCoderIds && agentRelationships.currentCoderIds.length > 0);
  
  if (!showTabs) {
    // 如果coder没有消息，直接显示planner消息
    return (
      <ChatView 
        isHidden={false}
        showHistoryView={showHistoryView}
        showAnnouncement={showAnnouncement}
        hideAnnouncement={hideAnnouncement}
        messageSource="planner"
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
          isHidden={false}
          showHistoryView={showHistoryView}
          showAnnouncement={showAnnouncement}
          hideAnnouncement={hideAnnouncement}
          messageSource={selectedTab}
        />
      </TabContent>
    </TabsContainer>
  );
};

export default AgentTabs; 