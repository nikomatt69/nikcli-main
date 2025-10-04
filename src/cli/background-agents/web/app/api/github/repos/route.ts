import { NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
        return NextResponse.json({ error: 'Missing GitHub token' }, { status: 400 })
    }

    try {
        const octokit = new Octokit({ auth: token })

        const { data } = await octokit.repos.listForAuthenticatedUser({
            sort: 'updated',
            per_page: 100,
            affiliation: 'owner,collaborator',
        })

        return NextResponse.json({
            repos: data.map((repo) => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                default_branch: repo.default_branch,
                language: repo.language,
                updated_at: repo.updated_at,
                private: repo.private,
                html_url: repo.html_url,
            })),
        })
    } catch (error: any) {
        console.error('GitHub API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch repositories', details: error.message },
            { status: 500 }
        )
    }
}

