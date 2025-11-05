import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search } from 'lucide-react'
import { JobListFilters } from '@/types/jobs'

interface JobFiltersProps {
  filters: JobListFilters
  onFilterChange: (key: keyof JobListFilters, value: unknown) => void
}

export default function JobFilters({ filters, onFilterChange }: JobFiltersProps) {
  return (
    <div className="flex items-end gap-4">
      <div className="flex-1">
        <Label htmlFor="search">Search by repository</Label>
        <div className="relative mt-1.5">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Filter by repository name..."
            value={filters.repo || ''}
            onChange={(e) => onFilterChange('repo', e.target.value || undefined)}
            className="pl-9"
          />
        </div>
      </div>
    </div>
  )
}
