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
  Upload,
} from 'lucide-react';
import { format } from 'date-fns';
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

interface VideoUpload {
  id: string;
  claimId: string;
  videoUrl: string;
  filename: string;
  duration?: number;
  processedUntil: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
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
  sessionId?: string;
}

interface SegmentAnalysis {
  id: string;
  uploadId: string;
  startTime: number;
  endTime: number;
  deceptionScore: number;
  voiceStress: number;
  visualBehavior: number;
  expressionMeasurement: number;
  createdAt: string;
}

interface Document {
  id: string;
  type: string;
  filename: string;
  storageUrl: string;
  createdAt: string;
}

export function UploadDetailPage() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const navigate = useNavigate();

  const { data: upload, isLoading } = useQuery({
    queryKey: ['upload', uploadId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/video/uploads/${uploadId}`);
      return data.data as VideoUpload;
    },
    enabled: !!uploadId,
  });

  const { data: segmentsRes } = useQuery({
    queryKey: ['upload-segments', uploadId],
    queryFn: async () => {
      const response = await apiClient.get(`/video/uploads/${uploadId}/segments`);
      return response.data;
    },
    enabled: !!uploadId,
  });

  const segments = (
    Array.isArray(segmentsRes?.data)
      ? segmentsRes.data
      : Array.isArray(segmentsRes)
        ? segmentsRes
        : []
  ) as SegmentAnalysis[];

  const { data: documentsRes } = useQuery({
    queryKey: ['documents', upload?.claimId],
    queryFn: async () => {
      const response = await apiClient.get(`/claims/${upload?.claimId}/documents`);
      return response.data;
    },
    enabled: !!upload?.claimId,
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

  // Prepare metrics data for the chart from segments
  const metricsData = Array.isArray(segments)
    ? segments.map(segment => ({
        time: `${Math.floor(segment.startTime)}s`,
        deception: Number(segment.deceptionScore) * 100,
        voice: Number(segment.voiceStress) * 100,
        visual: Number(segment.visualBehavior) * 100,
        expression: Number(segment.expressionMeasurement) * 100,
      }))
    : [];

  const latestSegment =
    Array.isArray(segments) && segments.length > 0 ? segments[segments.length - 1] : null;

  // Calculate average scores
  const avgScores =
    Array.isArray(segments) && segments.length > 0
      ? {
          deception:
            segments.reduce((sum, s) => sum + Number(s.deceptionScore), 0) / segments.length,
          voice: segments.reduce((sum, s) => sum + Number(s.voiceStress), 0) / segments.length,
          visual: segments.reduce((sum, s) => sum + Number(s.visualBehavior), 0) / segments.length,
          expression:
            segments.reduce((sum, s) => sum + Number(s.expressionMeasurement), 0) / segments.length,
        }
      : null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!upload) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Upload Not Found</h2>
        <p className="text-slate-600 mb-6">The requested video upload could not be found.</p>
        <Button onClick={() => navigate('/sessions')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/sessions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Manual Upload Video</h1>
            <p className="text-slate-600 mt-1">Claim: {upload.claim.claimNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              upload.status === 'COMPLETED'
                ? 'default'
                : upload.status === 'FAILED'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {upload.status}
          </Badge>
          {upload.status === 'PROCESSING' && (
            <Badge variant="outline">
              {Math.round((upload.processedUntil / (upload.duration || 1)) * 100)}% Processed
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Video and Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player */}
          <Card className="overflow-hidden">
            <div className="bg-slate-900 aspect-video flex items-center justify-center">
              {upload.videoUrl ? (
                <video controls className="w-full h-full" src={upload.videoUrl}>
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="text-center text-slate-400">
                  <Video className="h-16 w-16 mx-auto mb-4" />
                  <p className="text-sm">Video not available</p>
                </div>
              )}
            </div>
          </Card>

          {/* Metrics Graph */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Deception Metrics Over Time
            </h3>
            {metricsData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metricsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 12 }} stroke="#64748b" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f1f5f9',
                    }}
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
              <div className="h-64 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                  <p>
                    {upload.status === 'PROCESSING'
                      ? 'Analysis in progress...'
                      : 'No metrics data available'}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column - Upload Info */}
        <div className="space-y-6">
          {/* Upload Details */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Upload Details</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Upload className="h-4 w-4" />
                  <span className="font-medium">Filename</span>
                </div>
                <p className="text-slate-900 ml-6 text-sm break-all">{upload.filename}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="font-medium">Upload Date</span>
                </div>
                <p className="text-slate-900 ml-6">
                  {format(new Date(upload.createdAt), 'MMMM dd, yyyy')}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">Upload Time</span>
                </div>
                <p className="text-slate-900 ml-6">
                  {format(new Date(upload.createdAt), 'hh:mm a')}
                </p>
              </div>

              {upload.duration && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <Video className="h-4 w-4" />
                    <span className="font-medium">Duration</span>
                  </div>
                  <p className="text-slate-900 ml-6">
                    {Math.floor(upload.duration / 60)}m {Math.floor(upload.duration % 60)}s
                  </p>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <Hash className="h-4 w-4" />
                  <span className="font-medium">Claim Number</span>
                </div>
                <p className="text-slate-900 ml-6 font-mono text-sm">{upload.claim.claimNumber}</p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                  <User className="h-4 w-4" />
                  <span className="font-medium">Claimant</span>
                </div>
                <p className="text-slate-900 ml-6">{upload.claim.claimant.fullName}</p>
                <p className="text-slate-600 ml-6 text-sm">{upload.claim.claimant.phoneNumber}</p>
              </div>
            </div>
          </Card>

          {/* Average Analysis Scores */}
          {avgScores && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Average Analysis</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600">Deception Score</span>
                    <span className="text-lg font-bold text-purple-600">
                      {(avgScores.deception * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-600 transition-all"
                      style={{
                        width: `${avgScores.deception * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600">Voice Stress</span>
                    <span className="text-sm font-semibold text-blue-600">
                      {(avgScores.voice * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{
                        width: `${avgScores.voice * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600">Visual Behavior</span>
                    <span className="text-sm font-semibold text-green-600">
                      {(avgScores.visual * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-600 transition-all"
                      style={{
                        width: `${avgScores.visual * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-slate-600">Expression</span>
                    <span className="text-sm font-semibold text-pink-600">
                      {(avgScores.expression * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pink-600 transition-all"
                      style={{
                        width: `${avgScores.expression * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Based on {segments?.length || 0} analyzed segments
              </p>
            </Card>
          )}

          {/* Consent Form */}
          {consentForm && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Documents</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-slate-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Consent Form</p>
                      <p className="text-xs text-slate-600">
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
  );
}
