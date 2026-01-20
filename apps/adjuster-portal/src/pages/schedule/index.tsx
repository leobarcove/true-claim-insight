import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Header } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  AlertCircle,
  Bell,
} from 'lucide-react';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  parseISO,
} from 'date-fns';
import { cn, convertToTitleCase } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useClaims, useScheduleSession, claimKeys, useClaimStats } from '@/hooks/use-claims';
import type { ClaimStatus, SessionStatus } from '@tci/shared-types';
import { toast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui';

interface Session {
  id: string;
  claimId: string;
  status: SessionStatus;
  scheduledTime?: string;
  claim: {
    id: string;
    claimNumber: string;
    claimant: {
      fullName: string;
    };
  };
}

export function SchedulePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [isEditing, setIsEditing] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  // Requirement: Week should begin from Monday
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const { data: allClaimsRes, isLoading: isLoadingClaims } = useClaims({
    limit: 100,
  });

  const { data: statsData, isLoading: statsLoading } = useClaimStats();

  const allClaims = allClaimsRes?.claims || [];
  const scheduledClaims = allClaims.filter((c: any) => c.scheduledAssessmentTime);

  // Filter for upcoming sessions only (future dates)
  const now = new Date();
  const upcomingClaims = scheduledClaims.filter(
    (c: any) => parseISO(c.scheduledAssessmentTime) >= now
  );

  const availableClaims = allClaims.filter(
    (c: any) => !['APPROVED', 'REJECTED', 'CLOSED'].includes(c.status)
  );

  const scheduleMutation = useScheduleSession();

  const getSessionsForDay = (day: Date) => {
    return scheduledClaims.filter(
      (c: any) => c.scheduledAssessmentTime && isSameDay(parseISO(c.scheduledAssessmentTime), day)
    );
  };

  const handleSessionClick = (claim: any) => {
    setSelectedClaimId(claim.id);
    const date = parseISO(claim.scheduledAssessmentTime);
    setScheduledDate(format(date, 'yyyy-MM-dd'));
    setScheduledTime(format(date, 'HH:mm'));
    setIsEditing(true);
    setIsAddEventOpen(true);
  };

  const handleAddNew = () => {
    setSelectedClaimId('');
    setScheduledDate(format(new Date(), 'yyyy-MM-dd'));
    setScheduledTime('09:00');
    setIsEditing(false);
    setIsAddEventOpen(true);
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClaimId || !scheduledDate || !scheduledTime) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    // Construct a Date object in the user's local timezone
    const [year, month, day] = scheduledDate.split('-').map(Number);
    const [hour, minute] = scheduledTime.split(':').map(Number);
    const date = new Date(year, month - 1, day, hour, minute);
    const scheduledAt = date.toISOString();

    try {
      await scheduleMutation.mutateAsync({
        claimId: selectedClaimId,
        scheduledAt,
      });

      toast({
        title: 'Success',
        description: isEditing ? 'Session has been updated' : 'Session has been scheduled',
      });

      setIsAddEventOpen(false);
      setSelectedClaimId('');
      setIsEditing(false);
      // Invalidate queries to refresh calendar
      queryClient.invalidateQueries({ queryKey: claimKeys.lists() });
    } catch (error) {
      toast({
        title: 'Error',
        description: isEditing ? 'Failed to update session' : 'Failed to schedule session',
        variant: 'destructive',
      });
    }
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Stats for the side panel
  const totalScheduled = upcomingClaims.length; // Only count future sessions
  const completedSessions = scheduledClaims.filter(
    (c: any) => c.status === ('COMPLETED' as SessionStatus)
  ).length;
  const todaySessions = getSessionsForDay(new Date());

  // Combined loading state
  const isLoading = isLoadingClaims || statsLoading;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <Header title="Schedule" description="View and manage scheduled claim sessions">
        <Dialog
          open={isAddEventOpen}
          onOpenChange={open => {
            setIsAddEventOpen(open);
            if (!open) setIsEditing(false);
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={handleAddNew} className="shadow-primary/20 shadow-lg -mr-3 scale-75">
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{isEditing ? 'Update Session' : 'New Session'}</DialogTitle>
              <DialogDescription>
                {isEditing
                  ? 'Update the date and time for the video assessment.'
                  : 'Select a claim and set the date and time for the video assessment.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateEvent} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="claim">Claim</Label>
                {isEditing ? (
                  <div className="p-3 rounded-md border bg-muted/50 font-bold text-sm">
                    {scheduledClaims.find(c => c.id === selectedClaimId)?.claimNumber}
                  </div>
                ) : (
                  <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a claim" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClaims.map((claim: any) => (
                        <SelectItem key={claim.id} value={claim.id}>
                          {claim.claimNumber} - {claim.claimant?.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="block w-full dark:[color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className="block w-full dark:[color-scheme:dark]"
                  />
                </div>
              </div>
              <DialogFooter className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddEventOpen(false)}
                  disabled={scheduleMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={scheduleMutation.isPending}>
                  {scheduleMutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Submit'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </Header>

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {isLoading ? (
          <>
            {/* Calendar Skeleton */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-4 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-[200px] rounded-lg" />
                </div>
                <Skeleton className="h-9 w-20 rounded-md" />
              </div>
              <Skeleton className="flex-1 rounded-2xl" />
            </div>

            {/* Side Panel Skeleton */}
            <div className="hidden xl:flex w-72 flex-col gap-6 overflow-hidden">
              <div className="space-y-6">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-72 w-full" />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Calendar */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-4 bg-muted/30 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-card rounded-lg border shadow-sm h-9">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-l-md"
                      onClick={prevMonth}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="px-4 text-sm font-bold min-w-[140px] text-center">
                      {format(currentDate, 'MMMM yyyy')}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-r-md"
                      onClick={nextMonth}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  className="bg-card h-9 px-4"
                >
                  Today
                </Button>
              </div>

              <Card className="flex-1 flex flex-col border shadow-2xl bg-card/60 backdrop-blur-md overflow-hidden rounded-2xl border-primary/5">
                {/* Calendar Header - Monday Start */}
                <div className="grid grid-cols-7 border-b bg-muted/40 divide-x">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <div
                      key={day}
                      className="py-2 text-center text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]"
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Grid - Full Height */}
                <div className="flex-1 grid grid-cols-7 auto-rows-fr divide-x divide-y border-t-0 min-h-0">
                  {calendarDays.map((day, idx) => {
                    const daySessions = getSessionsForDay(day);
                    const isCurrentMonth = isSameMonth(day, monthStart);

                    return (
                      <div
                        key={day.toString()}
                        className={cn(
                          'min-h-[100px] p-2 transition-all relative group overflow-hidden',
                          !isCurrentMonth ? 'bg-muted/5 opacity-50' : 'bg-card hover:bg-accent/10'
                        )}
                      >
                        <div className="flex justify-between items-center mb-3">
                          <span
                            className={cn(
                              'text-xs font-bold flex items-center justify-center h-6 w-6 rounded-xl transition-all',
                              isToday(day)
                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110'
                                : isCurrentMonth
                                  ? 'text-foreground group-hover:scale-110'
                                  : 'text-muted-foreground'
                            )}
                          >
                            {format(day, 'd')}
                          </span>
                          {daySessions.length > 0 && (
                            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>

                        <div className="relative">
                          {/* Mobile dots */}
                          <div className="md:hidden flex flex-wrap gap-0.5 mt-1">
                            {daySessions.slice(0, 4).map((claim: any) => (
                              <div
                                key={claim.id}
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  claim.status === 'SCHEDULED' ? 'bg-primary' : 'bg-emerald-500'
                                )}
                              />
                            ))}
                          </div>

                          {/* Desktop stacked events */}
                          <div className="hidden md:block relative group/events">
                            {daySessions.length > 0 && (
                              <div className="relative">
                                {/* Stacked container - expands on hover */}
                                <div
                                  className={cn(
                                    'transition-all duration-300 ease-out relative',
                                    'group-hover/events:space-y-1.5',
                                    daySessions.length > 1
                                      ? 'overflow-hidden group-hover/events:overflow-y-auto'
                                      : 'overflow-hidden',
                                    'scrollbar-[width:2px] scrollbar-thin scrollbar-thumb-muted-foreground/10 hover:scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent',
                                    'p-0.5 pb-1'
                                  )}
                                  style={{
                                    height: 'auto',
                                    maxHeight: daySessions.length >= 1 ? '50px' : '32px',
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.style.maxHeight =
                                      daySessions.length > 1 ? '85px' : '50px';
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.style.maxHeight =
                                      daySessions.length >= 1 ? '50px' : '32px';
                                  }}
                                >
                                  {daySessions.map((claim: any, index: number) => (
                                    <div
                                      key={claim.id}
                                      onClick={e => {
                                        e.stopPropagation();
                                        handleSessionClick(claim);
                                      }}
                                      style={{
                                        transform: `translateY(${index * 3 + 3 * Number(index > 0)}px) scaleX(${1 - index * 0.06})`,
                                        transformOrigin: 'top center',
                                        zIndex: daySessions.length - index,
                                        position: index === 0 ? 'relative' : 'absolute',
                                        top: '2px',
                                        left: '2px',
                                        right: '2px',
                                      }}
                                      className={cn(
                                        'p-1.5 text-[9px] rounded-lg cursor-pointer transition-all border shadow-sm',
                                        'hover:shadow-md hover:scale-[1.02] active:scale-95',
                                        'group-hover/events:!static group-hover/events:!transform-none group-hover/events:!scale-100',
                                        isToday(day)
                                          ? 'bg-card text-foreground border-primary/80 shadow-primary/30'
                                          : 'bg-card text-card-foreground border-border shadow-sm'
                                      )}
                                    >
                                      <div className="font-bold truncate tracking-tight flex justify-between items-center">
                                        <span>{claim.claimNumber}</span>
                                        <span className="opacity-70 font-medium">
                                          {format(parseISO(claim.scheduledAssessmentTime), 'HH:mm')}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                  <div className="h-3 invisible" />
                                  {/* Bottom spacer for scroll visibility */}
                                </div>

                                {/* Event count indicator when stacked */}
                                {daySessions.length > 1 && (
                                  <div className="absolute bottom-0 -right-1 mb-2 h-4 w-4 rounded-full bg-card text-primary border border-primary/30 backdrop-blur-sm text-[8px] font-bold flex items-center justify-center shadow-sm group-hover/events:opacity-0 transition-opacity pointer-events-none z-[10]">
                                    {daySessions.length}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Add button on hover for each day */}
                        <button
                          onClick={() => {
                            setScheduledDate(format(day, 'yyyy-MM-dd'));
                            setIsAddEventOpen(true);
                          }}
                          className="absolute bottom-0 mb-2 right-2 h-6 w-6 rounded-lg bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Side Panel */}
            <div className="hidden xl:flex w-72 flex-col gap-6 overflow-hidden">
              {/* Upcoming Sessions */}
              <Card className="shadow-sm border-border/60 hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Upcoming Sessions
                  </CardTitle>
                  <div
                    className={`p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20`}
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between">
                    <div className="text-2xl font-bold">{totalScheduled}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Today's Schedule */}
              <Card className="shadow-sm border-border/60 hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Today's Schedule
                  </CardTitle>
                  <div
                    className={`p-2 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20`}
                  >
                    <Bell className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {todaySessions.length > 0 ? (
                      todaySessions.map((claim: any) => (
                        <div
                          key={claim.id}
                          onClick={() => navigate(`/claims/${claim.id}`)}
                          className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                          <div className="space-y-1 flex-1">
                            <p className="text-sm font-medium">{claim.claimNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {claim.claimant?.fullName}
                            </p>
                          </div>
                          <Badge variant="info" className="text-[10px]">
                            {format(parseISO(claim.scheduledAssessmentTime), 'hh:mm a')}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="py-4 text-center rounded-[2.5rem] flex flex-col items-center">
                        <div className="h-12 w-12 rounded-full bg-muted/10 flex items-center justify-center">
                          <AlertCircle className="h-6 w-6 text-muted-foreground/30" />
                        </div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                          No sessions today
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
