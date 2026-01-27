import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileText,
  Download,
  AlertCircle,
  Video,
  User,
  Hash,
} from 'lucide-react';
import { format } from 'date-fns';
import { Header } from '@/components/layout/header';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

interface Session {
  id: string;
  claimId: string;
  status: string;
  scheduledTime?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  analysisStatus: string;
  createdAt: string;
  claim: {
    id: string;
    claimNumber: string;
    policyNumber: string;
    incidentDate: string;
    claimant: {
      fullName: string;
      phoneNumber: string;
      email?: string;
    };
  };
  deceptionScores: Array<{
    id: string;
    deceptionScore: number;
    voiceStress: number;
    visualBehavior: number;
    expressionMeasurement: number;
    createdAt: string;
  }>;
}

interface Document {
  id: string;
  type: string;
  filename: string;
  storageUrl: string;
  createdAt: string;
}

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/video/rooms/${sessionId}`);
      return data.data as Session;
    },
    enabled: !!sessionId,
  });

  const { data: documentsRes } = useQuery({
    queryKey: ['documents', session?.claimId],
    queryFn: async () => {
      const response = await apiClient.get(`/claims/${session?.claimId}/documents`);
      return response.data;
    },
    enabled: !!session?.claimId,
  });

  const documents = (
    Array.isArray(documentsRes?.data)
      ? documentsRes.data
      : Array.isArray(documentsRes)
        ? documentsRes
        : []
  ) as Document[];

  const consentForm = Array.isArray(documents)
    ? documents.find(doc => doc.type === 'SIGNED_STATEMENT')
    : null;

  // Prepare metrics data for the chart
  const metricsData = Array.isArray(session?.deceptionScores)
    ? session.deceptionScores.map((score, index) => ({
        time: format(new Date(score.createdAt), 'HH:mm:ss'),
        deception: Number(score.deceptionScore) * 100,
        voice: Number(score.voiceStress) * 100,
        visual: Number(score.visualBehavior) * 100,
        expression: Number(score.expressionMeasurement) * 100,
      }))
    : [];

  const latestScore = session?.deceptionScores?.[session.deceptionScores.length - 1];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Session Not Found</h2>
        <p className="text-muted-foreground mb-6">The requested session could not be found.</p>
        <Button onClick={() => navigate('/sessions')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Live Session"
        description={
          <span className="font-medium text-muted-foreground">
            Claim: {session.claim.claimNumber}
          </span>
        }
      >
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/sessions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Video and Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Player */}
            <Card className="overflow-hidden">
              <div className="bg-slate-900 aspect-video flex items-center justify-center">
                {session.recordingUrl ? (
                  <video controls className="w-full h-full" src={session.recordingUrl}>
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="text-center text-slate-400">
                    <Video className="h-16 w-16 mx-auto mb-4" />
                    <p className="text-sm">
                      {session.status === 'COMPLETED'
                        ? 'Recording is being processed...'
                        : 'Recording not available yet'}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Metrics Graph */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Deception Metrics Over Time</h3>
              {metricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={metricsData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[0, 1]} hide />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--popover-foreground))',
                      }}
                      formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="deception"
                      name="Deception Score"
                      stroke="#a855f7"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="voice"
                      name="Voice Stress"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="visual"
                      name="Visual Behavior"
                      stroke="#10b981"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expression"
                      name="Expression"
                      stroke="#ec4899"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
                    <p>No metrics data available</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Session Info */}
          <div className="space-y-6">
            {/* Session Details */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Session Details</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Calendar className="h-4 w-4" />
                    <span className="font-medium">Date</span>
                  </div>
                  <p className="font-medium ml-6">
                    {format(new Date(session.createdAt), 'MMMM dd, yyyy')}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">Time</span>
                  </div>
                  <p className="text-foreground ml-6">
                    {session.startedAt ? format(new Date(session.startedAt), 'hh:mm a') : 'N/A'}
                  </p>
                </div>

                {session.durationSeconds && (
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Video className="h-4 w-4" />
                      <span className="font-medium">Duration</span>
                    </div>
                    <p className="text-foreground ml-6">
                      {Math.floor(session.durationSeconds / 60)}m {session.durationSeconds % 60}s
                    </p>
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Hash className="h-4 w-4" />
                    <span className="font-medium">Claim Number</span>
                  </div>
                  <p className="text-foreground ml-6 font-mono text-sm">
                    {session.claim.claimNumber}
                  </p>
                </div>

                <div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <User className="h-4 w-4" />
                    <span className="font-medium">Claimant</span>
                  </div>
                  <p className="text-foreground ml-6">{session.claim.claimant.fullName}</p>
                  <p className="text-muted-foreground ml-6 text-sm">
                    {session.claim.claimant.phoneNumber}
                  </p>
                </div>
              </div>
            </Card>

            {/* Latest Deception Score */}
            {latestScore && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Latest Analysis</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Deception Score</span>
                      <span className="text-lg font-bold text-foreground">
                        {(Number(latestScore.deceptionScore) * 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 transition-all"
                        style={{
                          width: `${Number(latestScore.deceptionScore) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Voice Stress</span>
                      <span className="text-sm font-semibold text-foreground">
                        {(Number(latestScore.voiceStress) * 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{
                          width: `${Number(latestScore.voiceStress) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Visual Behavior</span>
                      <span className="text-sm font-semibold text-foreground">
                        {(Number(latestScore.visualBehavior) * 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 transition-all"
                        style={{
                          width: `${Number(latestScore.visualBehavior) * 100}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">Expression</span>
                      <span className="text-sm font-semibold text-foreground">
                        {(Number(latestScore.expressionMeasurement) * 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pink-600 transition-all"
                        style={{
                          width: `${Number(latestScore.expressionMeasurement) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Consent Form */}
            {consentForm && (
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Documents</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Consent Form</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(consentForm.createdAt), 'MMM dd, yyyy')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(consentForm.storageUrl, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
