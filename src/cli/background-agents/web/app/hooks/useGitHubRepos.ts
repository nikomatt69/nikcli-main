'use client'

import { useEffect, useState } from 'react'

export interface GitHubRepo {
    id: number
    name: string
    full_name: string
    description: string | null
    default_branch: string
    language: string | null
    updated_at: string
}

export function useGitHubRepos(token?: string) {
    const [repos, setRepos] = useState<GitHubRepo[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!token) return

        setLoading(true)
        setError(null)

        fetch(`/api/github/repos?token=${encodeURIComponent(token)}`)
            .then((res) => {
                if (!res.ok) throw new Error('Failed to fetch repositories')
                return res.json()
            })
            .then((data) => {
                setRepos(data.repos || [])
                setLoading(false)
            })
            .catch((err) => {
                setError(err.message)
                setLoading(false)
            })
    }, [token])

    return { repos, loading, error }
}

