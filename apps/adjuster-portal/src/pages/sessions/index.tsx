import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Video,
  Calendar,
  Clock,
  Play,
  Upload,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  List,
  Grid,
  MoreHorizontal,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { convertToTitleCase } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';
import { useDebounce } from '@/hooks/use-debounce';

interface Session {
  id: string;
  claimId: string;
  status: 'SCHEDULED' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  scheduledTime?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  analysisStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  claim: {
    id: string;
    claimNumber: string;
    claimant: {
      fullName: string;
    };
  };
}

interface VideoUpload {
  id: string;
  claimId: string;
  videoUrl: string;
  filename: string;
  duration?: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  claim: {
    id: string;
    claimNumber: string;
    claimant: {
      fullName: string;
    };
  };
}

type VideoSessionItem = { type: 'live'; data: Session } | { type: 'upload'; data: VideoUpload };

export function VideoSessionsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'live' | 'upload'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 400);
  const limit = 10;

  // Fetch live sessions
  const { data: sessionsRes, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['sessions', 'all', page, debouncedSearch],
    queryFn: async () => {
      const response = await apiClient.get(
        `/video/rooms?page=${page}&limit=${limit}&search=${debouncedSearch}`
      );
      // The API returns { success: true, data: { data: [], total, ... } }
      // We want the inner data object
      return response.data?.data || response.data;
    },
  });

  // Fetch video uploads
  const { data: uploadsRes, isLoading: isLoadingUploads } = useQuery({
    queryKey: ['video-uploads', 'all', page, debouncedSearch],
    queryFn: async () => {
      const response = await apiClient.get(
        `/video/uploads?page=${page}&limit=${limit}&search=${debouncedSearch}`
      );
      // The API returns { success: true, data: { data: [], total, ... } }
      // We want the inner data object
      return response.data?.data || response.data;
    },
  });

  const isLoading = isLoadingSessions || isLoadingUploads;

  const sessions = sessionsRes?.data || [];
  const uploads = uploadsRes?.data || [];
  const totalSessions = sessionsRes?.total || 0;
  const totalUploads = uploadsRes?.total || 0;

  // Calculate total pages based on current filter
  const totalPages =
    filter === 'all'
      ? Math.max(sessionsRes?.totalPages || 0, uploadsRes?.totalPages || 0)
      : filter === 'live'
        ? sessionsRes?.totalPages || 0
        : uploadsRes?.totalPages || 0;

  // Helper to handle filter change
  const handleFilterChange = (newFilter: 'all' | 'live' | 'upload') => {
    setFilter(newFilter);
    setPage(1); // Reset to first page when switching tabs
  };

  // Combine and sort sessions
  const allSessions: VideoSessionItem[] = [
    ...(Array.isArray(sessions) ? sessions.map(s => ({ type: 'live' as const, data: s })) : []),
    ...(Array.isArray(uploads) ? uploads.map(u => ({ type: 'upload' as const, data: u })) : []),
  ].sort((a, b) => {
    const dateA = new Date(a.data.createdAt).getTime();
    const dateB = new Date(b.data.createdAt).getTime();
    return dateB - dateA;
  });

  const filteredSessions = allSessions.filter(item => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  const handleViewSession = (item: VideoSessionItem) => {
    if (item.type === 'live') {
      navigate(`/sessions/${item.data.id}`);
    } else {
      navigate(`/sessions/upload/${item.data.id}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }
    > = {
      COMPLETED: { variant: 'default', icon: CheckCircle2 },
      IN_PROGRESS: { variant: 'secondary', icon: Play },
      PROCESSING: { variant: 'secondary', icon: Clock },
      FAILED: { variant: 'destructive', icon: XCircle },
      CANCELLED: { variant: 'outline', icon: XCircle },
      PENDING: { variant: 'secondary', icon: Clock },
      SCHEDULED: { variant: 'outline', icon: Calendar },
      WAITING: { variant: 'outline', icon: Clock },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="text-xs">
        <Icon className="h-3 w-3 mr-1" />
        {convertToTitleCase(status)}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <Header
        title="Sessions"
        description="View and manage all video assessment sessions and uploads"
      >
        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Search by ID or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-[280px]"
          />
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Filter Tabs and View Toggle */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex gap-2">
            <button
              onClick={() => handleFilterChange('all')}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                filter === 'all'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({totalSessions + totalUploads})
            </button>
            <button
              onClick={() => handleFilterChange('live')}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                filter === 'live'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Live Sessions ({totalSessions})
            </button>
            <button
              onClick={() => handleFilterChange('upload')}
              className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
                filter === 'upload'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Manual Uploads ({totalUploads})
            </button>
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-muted/50 rounded-lg p-1 mb-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-md ${viewMode === 'table' ? 'bg-background shadow-sm' : ''}`}
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-md ${viewMode === 'card' ? 'bg-background shadow-sm' : ''}`}
              onClick={() => setViewMode('card')}
            >
              <Grid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Sessions Grid */}
        <div className="transition-all duration-300">
          {isLoading ? (
            viewMode === 'table' ? (
              <div className="rounded-md border animate-in fade-in duration-300">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead colSpan={7}>
                        <Skeleton className="h-4 w-full" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...Array(3)].map((_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-4 w-32" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-24 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-5 w-20 rounded-full" />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-3 w-16" />
                        </TableCell>
                        <TableCell>
                          <Skeleton className="h-8 w-8 ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-40 w-full mb-4" />
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </Card>
                ))}
              </div>
            )
          ) : filteredSessions.length === 0 ? (
            <Card className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No sessions found</h3>
              <p className="text-slate-600">
                {filter === 'all'
                  ? 'No video sessions or uploads available yet.'
                  : filter === 'live'
                    ? 'No live sessions available yet.'
                    : 'No manual uploads available yet.'}
              </p>
            </Card>
          ) : viewMode === 'table' ? (
            /* Table View */
            <div className="rounded-md border animate-in fade-in duration-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim Number</TableHead>
                    <TableHead>Claimant</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSessions.map(item => (
                    <TableRow
                      key={`${item.type}-${item.data.id}`}
                      className="cursor-pointer hover:bg-accent/50"
                      onClick={() => handleViewSession(item)}
                    >
                      <TableCell className="font-medium">{item.data.claim.claimNumber}</TableCell>
                      <TableCell>{item.data.claim.claimant.fullName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {item.type === 'live' ? 'Live Session' : 'Manual Upload'}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.data.status)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col text-xs">
                          <span>{format(new Date(item.data.createdAt), 'MMM dd, yyyy')}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(item.data.createdAt), 'hh:mm a')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.type === 'live' && item.data.durationSeconds ? (
                          <span>
                            {Math.floor(item.data.durationSeconds / 60)}m{' '}
                            {item.data.durationSeconds % 60}s
                          </span>
                        ) : item.type === 'upload' && item.data.duration ? (
                          <span>
                            {Math.floor(item.data.duration / 60)}m{' '}
                            {Math.floor(item.data.duration % 60)}s
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={e => {
                              e.stopPropagation();
                              handleViewSession(item);
                            }}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
              {filteredSessions.map((item, index) => (
                <Card
                  key={`${item.type}-${item.data.id}`}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleViewSession(item)}
                >
                  {/* Thumbnail */}
                  <div className="relative h-40 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                    {item.type === 'live' ? (
                      <Video className="h-16 w-16 text-slate-400" />
                    ) : (
                      <Upload className="h-16 w-16 text-slate-400" />
                    )}
                    <div className="absolute top-2 right-2">{getStatusBadge(item.data.status)}</div>
                    <div className="absolute top-2 left-2">
                      <Badge variant="outline" className="text-xs bg-white/10 backdrop-blur-sm">
                        {item.type === 'live' ? 'Live Session' : 'Manual Upload'}
                      </Badge>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-1">
                        {item.data.claim.claimNumber}
                      </h3>
                      <p className="text-sm text-slate-600">{item.data.claim.claimant.fullName}</p>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(item.data.createdAt), 'MMM dd, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(item.data.createdAt), 'hh:mm a')}</span>
                      </div>
                      {item.type === 'live' && item.data.durationSeconds && (
                        <div className="flex items-center gap-2">
                          <Video className="h-3 w-3" />
                          <span>
                            Duration: {Math.floor(item.data.durationSeconds / 60)}m{' '}
                            {item.data.durationSeconds % 60}s
                          </span>
                        </div>
                      )}
                      {item.type === 'upload' && item.data.duration && (
                        <div className="flex items-center gap-2">
                          <Video className="h-3 w-3" />
                          <span>
                            Duration: {Math.floor(item.data.duration / 60)}m{' '}
                            {Math.floor(item.data.duration % 60)}s
                          </span>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={e => {
                        e.stopPropagation();
                        handleViewSession(item);
                      }}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      View Session
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
