import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Header } from '@/components/layout';
import { Card } from '@/components/ui/card';
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
  Clock,
  Video,
  User,
  Plus,
  AlertCircle,
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
import { useClaims, useScheduleSession } from '@/hooks/use-claims';
import type { ClaimStatus, SessionStatus } from '@tci/shared-types';
import { toast } from '@/hooks/use-toast';

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

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  // Requirement: Week should begin from Monday
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  // Fetch sessions for the calendar
  const { data: sessionsRes, isLoading: isLoadingSessions } = useQuery({
    queryKey: ['sessions', 'scheduled', format(currentDate, 'yyyy-MM')],
    queryFn: async () => {
      const response = await apiClient.get('/video/rooms?page=1&limit=100');
      return response.data?.data || response.data;
    },
  });

  // Fetch claims for the "Add Event" dialog
  const { data: claimsRes } = useClaims({ limit: 100, status: 'ASSIGNED' as ClaimStatus });
  const scheduleMutation = useScheduleSession();

  const sessions = sessionsRes?.data || [];
  const scheduledSessions = sessions.filter((s: Session) => s.scheduledTime);

  const getSessionsForDay = (day: Date) => {
    return scheduledSessions.filter(
      (s: Session) => s.scheduledTime && isSameDay(parseISO(s.scheduledTime), day)
    );
  };

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const handleSessionClick = (sessionId: string) => {
    navigate(`/sessions/${sessionId}`);
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

    const scheduledAt = `${scheduledDate}T${scheduledTime}:00Z`;

    try {
      await scheduleMutation.mutateAsync({
        claimId: selectedClaimId,
        scheduledAt,
      });

      toast({
        title: 'Success',
        description: 'Session has been scheduled',
      });

      setIsAddEventOpen(false);
      setSelectedClaimId('');
      // Invalidate queries to refresh calendar
      queryClient.invalidateQueries({ queryKey: ['sessions', 'scheduled'] });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to schedule session',
        variant: 'destructive',
      });
    }
  };

  // Stats for the side panel
  const totalScheduled = scheduledSessions.length;
  const completedSessions = scheduledSessions.filter(
    (s: Session) => s.status === ('COMPLETED' as SessionStatus)
  ).length;
  const todaySessions = getSessionsForDay(new Date());

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <Header title="Schedule" description="View and manage scheduled claim sessions" />

      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Requirement: Navigator moved above calendar */}
          <div className="flex items-center justify-between mb-4 bg-muted/30 p-2 rounded-xl border">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday} className="h-9 px-4">
                Today
              </Button>
              <div className="flex items-center bg-background rounded-lg border shadow-sm h-9">
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

            <Dialog open={isAddEventOpen} onOpenChange={setIsAddEventOpen}>
              <DialogTrigger asChild>
                <Button className="shadow-primary/20 shadow-lg h-9">
                  <Plus className="h-4 w-4 mr-2" />
                  New Event
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Schedule New Session</DialogTitle>
                  <DialogDescription>
                    Select a claim and set the date and time for the remote assessment.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateEvent} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="claim">Select Claim</Label>
                    <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a claim" />
                      </SelectTrigger>
                      <SelectContent>
                        {claimsRes?.claims?.map(claim => (
                          <SelectItem key={claim.id} value={claim.id}>
                            {claim.claimNumber} - {claim.claimant?.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={scheduledDate}
                        onChange={e => setScheduledDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="time">Time</Label>
                      <Input
                        id="time"
                        type="time"
                        value={scheduledTime}
                        onChange={e => setScheduledTime(e.target.value)}
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
                      {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule Event'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="flex-1 flex flex-col border shadow-2xl bg-card/60 backdrop-blur-md overflow-hidden rounded-2xl border-primary/5">
            {/* Calendar Header - Monday Start */}
            <div className="grid grid-cols-7 border-b bg-muted/40 divide-x">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div
                  key={day}
                  className="py-4 text-center text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid - Full Height */}
            <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto divide-x divide-y border-t-0 min-h-0">
              {calendarDays.map((day, idx) => {
                const daySessions = getSessionsForDay(day);
                const isCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      'min-h-[140px] p-3 transition-all relative group',
                      !isCurrentMonth ? 'bg-muted/5 opacity-50' : 'bg-card hover:bg-accent/10'
                    )}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <span
                        className={cn(
                          'text-xs font-bold flex items-center justify-center h-8 w-8 rounded-xl transition-all',
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

                    <div className="space-y-1.5 overflow-y-auto max-h-[120px] scrollbar-hide">
                      {daySessions.map((session: Session) => (
                        <div
                          key={session.id}
                          onClick={() => handleSessionClick(session.id)}
                          className={cn(
                            'px-2.5 py-2 text-[10px] rounded-xl cursor-pointer transition-all border shadow-sm',
                            'hover:shadow-md hover:-translate-y-0.5 active:scale-95',
                            session.status === ('SCHEDULED' as SessionStatus)
                              ? 'bg-blue-500/10 text-blue-700 border-blue-200/50 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-800/50'
                              : 'bg-emerald-500/10 text-emerald-700 border-emerald-200/50 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-800/50'
                          )}
                        >
                          <div className="font-black truncate tracking-tight">
                            {session.claim.claimNumber}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 opacity-70 font-medium">
                            <Clock className="h-3 w-3" />
                            <span>{format(parseISO(session.scheduledTime!), 'hh:mm a')}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add button on hover for each day */}
                    <button
                      onClick={() => {
                        setScheduledDate(format(day, 'yyyy-MM-dd'));
                        setIsAddEventOpen(true);
                      }}
                      className="absolute bottom-2 right-2 h-7 w-7 rounded-lg bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100"
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
        <div className="hidden xl:flex w-80 flex-col gap-6 overflow-hidden">
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              Today's Schedule
            </h3>
            <div className="space-y-3 overflow-y-auto max-h-[400px] pr-2 scrollbar-thin">
              {todaySessions.length > 0 ? (
                todaySessions.map((session: Session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSessionClick(session.id)}
                    className="p-5 rounded-3xl border bg-card/40 backdrop-blur-sm hover:shadow-2xl hover:border-primary/20 transition-all cursor-pointer group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-3">
                      <Video className="h-4 w-4 text-primary/20 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex justify-between items-start mb-4">
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-black tracking-widest bg-background/50 border-primary/10"
                      >
                        {session.status}
                      </Badge>
                      <div className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-primary" />
                        {format(parseISO(session.scheduledTime!), 'hh:mm a')}
                      </div>
                    </div>
                    <h4 className="font-black text-sm mb-1 group-hover:text-primary transition-colors tracking-tight">
                      {session.claim.claimNumber}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium mb-4">
                      <User className="h-3 w-3" />
                      <span>{session.claim.claimant.fullName}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full rounded-2xl h-10 text-[10px] font-black uppercase tracking-widest border border-primary/5 group-hover:bg-primary group-hover:text-primary-foreground transition-all shadow-xl shadow-primary/10"
                    >
                      Start Session
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-16 text-center rounded-[2.5rem] border-2 border-dashed flex flex-col items-center gap-4 bg-muted/5">
                  <div className="h-12 w-12 rounded-full bg-muted/10 flex items-center justify-center">
                    <CalendarIcon className="h-6 w-6 text-muted-foreground/30" />
                  </div>
                  <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">
                    No sessions today
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">
              Activity stats
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-primary/10 to-transparent border border-primary/10 relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <CalendarIcon className="h-24 w-24" />
                </div>
                <div className="text-4xl font-black text-primary mb-1">{totalScheduled}</div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                  Upcoming Events
                </div>
              </div>
              <div className="p-6 rounded-[2rem] bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/10 relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Plus className="h-24 w-24" />
                </div>
                <div className="text-4xl font-black text-emerald-500 mb-1">{completedSessions}</div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                  Completed
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
