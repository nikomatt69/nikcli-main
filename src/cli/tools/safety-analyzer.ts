import { type PreflightReport, RiskLevelSchema, OperationTypeSchema } from '../schemas/tool-schemas'

type RiskLevel = typeof RiskLevelSchema._type
type OperationType = typeof OperationTypeSchema._type

export interface CommandPreflightInput {
    toolName: string
    operationType: OperationType
    command: string
    workingDirectory: string
}

export interface FilePreflightInput {
    toolName: string
    operationType: OperationType
    paths: string[]
}

export class SafetyAnalyzer {
    static preflightCommand(input: CommandPreflightInput): PreflightReport {
        const reasons: string[] = []
        let risk: RiskLevel = 'low'

        const cmd = input.command.toLowerCase()

        const critical = [/rm\s+-rf/, /fdisk/, /mkfs/, /dd\s+if=/, /format/, /shutdown/, /reboot/]
        if (critical.some((p) => p.test(cmd))) {
            risk = 'critical'
            reasons.push('Critical destructive pattern detected')
        }

        const high = [/\bsudo\b/, /chmod\s+777/, /chown\b/, /del\b/]
        if (risk !== 'critical' && high.some((p) => p.test(cmd))) {
            risk = 'high'
            reasons.push('High-risk privilege or permission change detected')
        }

        const medium = [/npm\s+install\b/, /yarn\s+add\b/, /docker\s+run\b/, /curl\b|wget\b/]
        if (risk === 'low' && medium.some((p) => p.test(cmd))) {
            risk = 'medium'
            reasons.push('Package install / network / container execution detected')
        }

        if (cmd.includes('..')) {
            reasons.push('Potential directory traversal in command')
            if (risk === 'low') risk = 'medium'
        }

        return {
            riskLevel: risk,
            operationType: input.operationType,
            reasons,
            summary: `${input.toolName} command preflight for '${input.command}'`,
            cognitive: {
                intent: cmd.split(/\s+/)[0],
                confidence: 0.7,
                risks: reasons,
                suggestions: risk === 'low' ? [] : ['Consider safeMode or review command carefully'],
            },
        }
    }

    static preflightFiles(input: FilePreflightInput): PreflightReport {
        const reasons: string[] = []
        let risk: RiskLevel = 'low'

        const paths = input.paths || []
        const touchingGit = paths.some((p) => /(^|\/)\.git(\/|$)/.test(p))
        if (touchingGit) {
            risk = 'high'
            reasons.push('Operation touches .git directory')
        }

        const envFiles = paths.filter((p) => /(^|\/)\.env(\.\w+)?$/.test(p))
        if (envFiles.length) {
            if (risk !== 'high') risk = 'medium'
            reasons.push('Operation involves environment file(s)')
        }

        const manyFiles = paths.length > 20
        if (manyFiles) {
            if (risk === 'low') risk = 'medium'
            reasons.push(`Batch operation on ${paths.length} files`)
        }

        return {
            riskLevel: risk,
            operationType: input.operationType,
            reasons,
            affectedPaths: paths,
            summary: `${input.toolName} file operation preflight (${paths.length} path(s))`,
        }
    }
}


