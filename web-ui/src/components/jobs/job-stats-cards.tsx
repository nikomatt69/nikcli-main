import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Activity, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { JobStats, JobStatus } from '@/types/jobs'
import { formatNumber } from '@/lib/utils'

interface JobStatsCardsProps {
  onStatusClick: (status: JobStatus | 'all') => void
}

export default function JobStatsCards({ onStatusClick }: JobStatsCardsProps) {
  const { data: response, isLoading } = useQuery({
    queryKey: ['job-stats'],
    queryFn: () => apiClient.get<JobStats>('/v1/stats'),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  const stats = response?.data

  const cards = [
    {
      title: 'Total Jobs',
      value: stats?.total || 0,
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      onClick: () => onStatusClick('all'),
    },
    {
      title: 'Running',
      value: stats?.running || 0,
      icon: Loader2,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      iconClass: 'animate-spin',
      onClick: () => onStatusClick('running'),
    },
    {
      title: 'Queued',
      value: stats?.queued || 0,
      icon: Clock,
      color: 'text-gray-400',
      bg: 'bg-gray-500/10',
      onClick: () => onStatusClick('queued'),
    },
    {
      title: 'Succeeded',
      value: stats?.succeeded || 0,
      icon: CheckCircle2,
      color: 'text-green-400',
      bg: 'bg-green-500/10',
      onClick: () => onStatusClick('succeeded'),
    },
    {
      title: 'Failed',
      value: stats?.failed || 0,
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      onClick: () => onStatusClick('failed'),
    },
  ]

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {cards.map((card, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card
            key={card.title}
            className="cursor-pointer transition-colors hover:bg-accent"
            onClick={card.onClick}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <h3 className="text-2xl font-bold mt-1">
                    {formatNumber(card.value)}
                  </h3>
                </div>
                <div className={`p-3 rounded-lg ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color} ${card.iconClass || ''}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
