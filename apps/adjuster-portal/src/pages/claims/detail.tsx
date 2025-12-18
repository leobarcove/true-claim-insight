import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Video,
  Clock,
  AlertTriangle,
  CheckCircle,
  Upload,
} from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDate, formatDateTime, getInitials } from '@/lib/utils';

// Mock claim detail
const mockClaimDetail = {
  id: 'CLM-2025-000123',
  claimNumber: 'CLM-2025-000123',
  status: 'SCHEDULED',
  type: 'OWN_DAMAGE',
  createdAt: '2025-12-16T09:30:00',
  updatedAt: '2025-12-17T14:20:00',
  incidentDate: '2025-12-15',
  description:
    'Rear-ended at traffic light junction in Petaling Jaya. The vehicle behind failed to brake in time causing damage to rear bumper and trunk.',
  incidentLocation: {
    address: 'Jalan SS 2/55, Petaling Jaya, Selangor',
    latitude: 3.1234,
    longitude: 101.6789,
  },
  claimant: {
    id: 'claimant-1',
    fullName: 'Tan Wei Ming',
    phoneNumber: '+60 12-345 6789',
    kycStatus: 'VERIFIED',
  },
  vehicle: {
    make: 'Honda',
    model: 'City',
    year: 2022,
    plateNumber: 'WXY 1234',
    colour: 'White',
  },
  documents: [
    { id: 'doc-1', type: 'DAMAGE_PHOTO', filename: 'rear-damage-1.jpg', createdAt: '2025-12-16' },
    { id: 'doc-2', type: 'DAMAGE_PHOTO', filename: 'rear-damage-2.jpg', createdAt: '2025-12-16' },
    { id: 'doc-3', type: 'POLICE_REPORT', filename: 'police-report.pdf', createdAt: '2025-12-16' },
  ],
  sessions: [
    {
      id: 'session-1',
      status: 'SCHEDULED',
      scheduledAt: '2025-12-18T10:00:00',
      riskAssessments: [],
    },
  ],
  notes: [
    {
      id: 'note-1',
      content: 'Claimant contacted, video session scheduled for Dec 18',
      authorName: 'Ahmad bin Abdullah',
      createdAt: '2025-12-17T14:20:00',
    },
  ],
  timeline: [
    { action: 'Claim submitted', timestamp: '2025-12-16T09:30:00' },
    { action: 'Assigned to Ahmad bin Abdullah', timestamp: '2025-12-16T10:15:00' },
    { action: 'Video session scheduled', timestamp: '2025-12-17T14:20:00' },
  ],
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive' }> = {
  SUBMITTED: { label: 'Submitted', variant: 'secondary' },
  ASSIGNED: { label: 'Assigned', variant: 'info' },
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  IN_ASSESSMENT: { label: 'In Assessment', variant: 'warning' },
  REPORT_PENDING: { label: 'Report Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
};

export function ClaimDetailPage() {
  const { id } = useParams();
  const claim = mockClaimDetail; // In production, fetch by ID

  return (
    <div className="flex flex-col h-full">
      <Header
        title={claim.claimNumber}
        description={`${claim.claimant.fullName} • ${claim.type.replace('_', ' ')}`}
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Back button and actions */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/claims">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Claims
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig[claim.status].variant} className="text-sm px-3 py-1">
              {statusConfig[claim.status].label}
            </Badge>
            {claim.status === 'SCHEDULED' && (
              <Button>
                <Video className="h-4 w-4 mr-2" />
                Start Video Session
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Incident Details */}
            <Card>
              <CardHeader>
                <CardTitle>Incident Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">{claim.description}</p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Incident Date</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(claim.incidentDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Location</p>
                      <p className="text-sm text-muted-foreground">
                        {claim.incidentLocation.address}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Vehicle Information */}
            <Card>
              <CardHeader>
                <CardTitle>Vehicle Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium">Make & Model</p>
                    <p className="text-sm text-muted-foreground">
                      {claim.vehicle.make} {claim.vehicle.model} ({claim.vehicle.year})
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Plate Number</p>
                    <p className="text-sm text-muted-foreground">{claim.vehicle.plateNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Colour</p>
                    <p className="text-sm text-muted-foreground">{claim.vehicle.colour}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Documents</CardTitle>
                <Button variant="outline" size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {claim.documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
                    >
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.type.replace('_', ' ')} • {formatDate(doc.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Notes</CardTitle>
                <Button variant="outline" size="sm">
                  Add Note
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {claim.notes.map((note) => (
                    <div key={note.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(note.authorName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{note.authorName}</p>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(note.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{note.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Claimant Info */}
            <Card>
              <CardHeader>
                <CardTitle>Claimant</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getInitials(claim.claimant.fullName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{claim.claimant.fullName}</p>
                    <Badge variant="success" className="text-xs">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      eKYC Verified
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {claim.claimant.phoneNumber}
                </div>
              </CardContent>
            </Card>

            {/* Scheduled Session */}
            {claim.sessions[0] && (
              <Card>
                <CardHeader>
                  <CardTitle>Video Session</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {formatDateTime(claim.sessions[0].scheduledAt)}
                      </span>
                    </div>
                    <Button className="w-full">
                      <Video className="h-4 w-4 mr-2" />
                      Start Session
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {claim.timeline.map((event, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="relative">
                        <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                        {index < claim.timeline.length - 1 && (
                          <div className="absolute left-0.5 top-4 bottom-0 w-px bg-border" />
                        )}
                      </div>
                      <div className="pb-4">
                        <p className="text-sm">{event.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(event.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
