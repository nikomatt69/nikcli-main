import * as fs from 'node:fs'
import * as path from 'node:path'

// Cache the workspace root as the launch directory, resolved to a real path
let workspaceRoot: string = (() => {
    try {
        const launch = process.cwd()
        return fs.existsSync(launch) ? fs.realpathSync(launch) : launch
    } catch {
        return process.cwd()
    }
})()

export function getWorkingDirectory(): string {
    return workspaceRoot
}

export function setWorkingDirectory(dir: string): void {
    const real = fs.realpathSync(dir)
    workspaceRoot = real
}

export function isInsideWorkspace(absolutePath: string): boolean {
    const candidate = path.resolve(absolutePath)
    const rel = path.relative(workspaceRoot, candidate)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function resolveWorkspacePath(inputPath: string | undefined): string {
    const target = !inputPath || inputPath === '.' ? workspaceRoot : path.isAbsolute(inputPath) ? inputPath : path.resolve(workspaceRoot, inputPath)

    // Prefer realpath when possible (existing files/dirs), otherwise rely on normalized path
    try {
        const real = fs.realpathSync(target)
        ensureInside(real)
        return real
    } catch {
        const normalized = path.normalize(target)
        ensureInside(normalized)
        return normalized
    }
}

export function toWorkspaceRelative(absolutePath: string): string {
    try {
        const real = fs.existsSync(absolutePath) ? fs.realpathSync(absolutePath) : absolutePath
        const rel = path.relative(workspaceRoot, real)
        if (rel === '') return '.'
        return rel.startsWith('..') || path.isAbsolute(rel) ? absolutePath : rel
    } catch {
        const rel = path.relative(workspaceRoot, absolutePath)
        if (rel === '') return '.'
        return rel.startsWith('..') || path.isAbsolute(rel) ? absolutePath : rel
    }
}

function ensureInside(absolutePath: string): void {
    const rel = path.relative(workspaceRoot, absolutePath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Path escapes workspace root: ${absolutePath}`)
    }
}


