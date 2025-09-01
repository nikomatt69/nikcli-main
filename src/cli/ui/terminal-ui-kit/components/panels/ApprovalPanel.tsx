import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { ApprovalRequest } from '../../types';

interface ApprovalPanelProps {
  title: string;
  borderColor?: string;
  pendingApprovals: ApprovalRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  autoFocus?: boolean;
}

const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  title,
  borderColor = 'green',
  pendingApprovals,
  onApprove,
  onReject,
  autoFocus = true,
}) => {
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(
    pendingApprovals[0] || null
  );
  const [showDetails, setShowDetails] = useState(false);

  // Input handling per approvazioni rapide
  useInput((input, key) => {
    if (!selectedApproval) return;

    if (input === 'y' || input === 'Y') {
      onApprove(selectedApproval.id);
    } else if (input === 'n' || input === 'N') {
      onReject(selectedApproval.id);
    } else if (input === 'd' || input === 'D') {
      setShowDetails(!showDetails);
    }
  });

  const getRiskLevelColor = (riskLevel: ApprovalRequest['riskLevel']) => {
    switch (riskLevel) {
      case 'low': return 'green';
      case 'medium': return 'yellow';
      case 'high': return 'red';
      case 'critical': return 'magenta';
      default: return 'gray';
    }
  };

  const getRiskLevelIcon = (riskLevel: ApprovalRequest['riskLevel']) => {
    switch (riskLevel) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🔴';
      case 'critical': return '🚨';
      default: return '⚪';
    }
  };

  const getTypeIcon = (type?: ApprovalRequest['type']) => {
    switch (type) {
      case 'plan': return '📋';
      case 'file': return '📄';
      case 'command': return '⚡';
      case 'package': return '📦';
      default: return '❓';
    }
  };

  const formatTimeout = (timeout?: number) => {
    if (!timeout) return '';
    const seconds = Math.floor(timeout / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
  };

  const selectItems = pendingApprovals.map(approval => ({
    label: `${getRiskLevelIcon(approval.riskLevel)} ${getTypeIcon(approval.type)} ${approval.title}`,
    value: approval,
  }));

  return (
    <Box 
      borderStyle="round" 
      borderColor={borderColor} 
      padding={1} 
      flexDirection="column"
      height="100%"
    >
      {/* Header */}
      <Box marginBottom={1} justifyContent="space-between">
        <Text color={borderColor} bold>{title}</Text>
        <Text color="gray" dimColor>
          {pendingApprovals.length} pending
        </Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flex={1}>
        {pendingApprovals.length === 0 ? (
          <Box justifyContent="center" alignItems="center" flex={1}>
            <Text color="gray" dimColor>
              ✅ No pending approvals
            </Text>
          </Box>
        ) : (
          <Box flexDirection="column" flex={1}>
            {/* Approval List */}
            {pendingApprovals.length > 1 && (
              <Box marginBottom={1}>
                <SelectInput
                  items={selectItems}
                  onSelect={(item) => setSelectedApproval(item.value)}
                />
              </Box>
            )}

            {/* Selected Approval Details */}
            {selectedApproval && (
              <Box flexDirection="column" flex={1}>
                <Box marginBottom={1} borderStyle="single" borderColor="gray" padding={1}>
                  <Box flexDirection="column">
                    {/* Title and Risk */}
                    <Box justifyContent="space-between" marginBottom={1}>
                      <Text bold>{selectedApproval.title}</Text>
                      <Box>
                        <Text>{getRiskLevelIcon(selectedApproval.riskLevel)} </Text>
                        <Text color={getRiskLevelColor(selectedApproval.riskLevel)}>
                          {selectedApproval.riskLevel.toUpperCase()}
                        </Text>
                      </Box>
                    </Box>

                    {/* Type and Timeout */}
                    <Box justifyContent="space-between" marginBottom={1}>
                      <Text>
                        {getTypeIcon(selectedApproval.type)} Type: {selectedApproval.type || 'general'}
                      </Text>
                      {selectedApproval.timeout && (
                        <Text color="yellow">
                          ⏱️ Timeout: {formatTimeout(selectedApproval.timeout)}
                        </Text>
                      )}
                    </Box>

                    {/* Description */}
                    <Text wrap="wrap" marginBottom={1}>
                      {selectedApproval.description}
                    </Text>

                    {/* Context Info */}
                    {selectedApproval.context && (
                      <Box flexDirection="column" marginBottom={1}>
                        {selectedApproval.context.workingDirectory && (
                          <Text color="gray" dimColor>
                            📁 Dir: {selectedApproval.context.workingDirectory}
                          </Text>
                        )}
                        {selectedApproval.context.affectedFiles && selectedApproval.context.affectedFiles.length > 0 && (
                          <Text color="gray" dimColor>
                            📄 Files: {selectedApproval.context.affectedFiles.length}
                          </Text>
                        )}
                        {selectedApproval.context.estimatedDuration && (
                          <Text color="gray" dimColor>
                            ⏱️ Est. Duration: {Math.round(selectedApproval.context.estimatedDuration / 1000)}s
                          </Text>
                        )}
                      </Box>
                    )}

                    {/* Actions Count */}
                    {selectedApproval.actions.length > 0 && (
                      <Text color="blue">
                        🔧 Actions: {selectedApproval.actions.length}
                      </Text>
                    )}
                  </Box>
                </Box>

                {/* Action Buttons */}
                <Box justifyContent="space-around" marginTop={1}>
                  <Box borderStyle="round" borderColor="green" padding={1}>
                    <Text color="green" bold>
                      [Y] Approve
                    </Text>
                  </Box>
                  <Box borderStyle="round" borderColor="red" padding={1}>
                    <Text color="red" bold>
                      [N] Reject
                    </Text>
                  </Box>
                  <Box borderStyle="round" borderColor="cyan" padding={1}>
                    <Text color="cyan" bold>
                      [D] Details
                    </Text>
                  </Box>
                </Box>

                {/* Detailed Actions */}
                {showDetails && selectedApproval.actions.length > 0 && (
                  <Box marginTop={1} borderStyle="single" borderColor="cyan" padding={1}>
                    <Box flexDirection="column">
                      <Text color="cyan" bold>🔧 Planned Actions:</Text>
                      {selectedApproval.actions.slice(0, 5).map((action, index) => (
                        <Text key={index} color="white" dimColor>
                          {index + 1}. {JSON.stringify(action).slice(0, 60)}...
                        </Text>
                      ))}
                      {selectedApproval.actions.length > 5 && (
                        <Text color="gray" dimColor>
                          ... and {selectedApproval.actions.length - 5} more actions
                        </Text>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {selectedApproval ? 'Y: Approve | N: Reject | D: Toggle Details' : 'No approvals needed'}
        </Text>
      </Box>
    </Box>
  );
};

export default ApprovalPanel;