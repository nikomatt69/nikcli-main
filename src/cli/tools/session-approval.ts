type Risk = 'none' | 'low' | 'medium' | 'high' | 'critical'

interface ApprovalKey {
    sessionId: string
    toolName: string
    scope: 'tool' | 'tool+opType'
    operationType: 'read' | 'write' | 'delete' | 'exec' | 'network' | 'other'
}

interface ApprovalRecord extends ApprovalKey {
    approvedAt: number
    riskMax: Risk
}

export class SessionApprovalManager {
    private static store: Map<string, ApprovalRecord> = new Map()

    private keyOf(key: ApprovalKey): string {
        const base = `${key.sessionId}::${key.toolName}`
        return key.scope === 'tool' ? base : `${base}::${key.operationType}`
    }

    approve(input: {
        sessionId: string
        toolName: string
        scope: 'tool' | 'tool+opType'
        operationType: 'read' | 'write' | 'delete' | 'exec' | 'network' | 'other'
        riskMax: Risk
    }): void {
        const rec: ApprovalRecord = {
            sessionId: input.sessionId,
            toolName: input.toolName,
            scope: input.scope,
            operationType: input.operationType,
            riskMax: input.riskMax,
            approvedAt: Date.now(),
        }
        SessionApprovalManager.store.set(this.keyOf(rec), rec)
    }

    isApproved(input: {
        sessionId: string
        toolName: string
        scope: 'tool' | 'tool+opType'
        operationType: 'read' | 'write' | 'delete' | 'exec' | 'network' | 'other'
        riskLevel: Risk
    }): boolean {
        const rec = SessionApprovalManager.store.get(this.keyOf(input))
        if (!rec) return false

        const order: Risk[] = ['none', 'low', 'medium', 'high', 'critical']
        const lvl = order.indexOf(input.riskLevel)
        const max = order.indexOf(rec.riskMax)
        return lvl <= max
    }
}


