import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClaimSubmissionWizard } from '@tci/ui-components';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button, Progress } from '@/components/ui';
import { Header } from '@/components/layout/header';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';

export function NewClaimPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    message: string;
  } | null>(null);

  const handleSuccess = async (data: any) => {
    setIsSubmitting(true);
    setUploadProgress({ current: 0, total: 100, message: 'Creating claim record...' });

    try {
      const user = useAuthStore.getState().user;
      const payload = {
        claimType: data.claimType || 'OWN_DAMAGE',
        incidentDate: data.incidentDate || new Date().toISOString().split('T')[0],
        incidentLocation: {
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
        },
        description: data.description || 'Claim submitted via AI Import',
        claimantName: data.claimantId,
        claimantPhone: data.mobileNumber,
        claimantNric: data.nric,
        nric: data.nric,
        tenantId: user?.tenantId,
        policyNumber: data.policyNumber || '',
        vehiclePlateNumber: data.vehiclePlate || '',
        vehicleMake: data.vehicleMake || '',
        vehicleModel: data.vehicleModel || '',
        vehicleYear: data.vehicleYear ? parseInt(data.vehicleYear) : undefined,
        vehicleChassisNumber: data.chassisNo || '',
        vehicleEngineNumber: data.engineNo || '',
        policeReportNumber: data.policeReportNumber || '',
        policeReportDate: data.policeReportDate || '',
        policeStation: data.policeStation || '',
        isPdpaCompliant: true,
      };

      console.log('Submitting claim payload:', payload);

      const response = await apiClient.post('/claims', payload);
      const claim = response.data.data;

      // Prepare all document/photo upload tasks
      const uploadTasks: { file: File; type: string; label: string }[] = [];

      if (data.photos && data.photos.length > 0) {
        data.photos.forEach((photo: File, index: number) => {
          uploadTasks.push({
            file: photo,
            type: 'DAMAGE_PHOTO',
            label: `Photo ${index + 1}`,
          });
        });
      }

      const otherDocs = [
        { key: 'policyDocument', type: 'POLICY_DOCUMENT', label: 'Policy Document' },
        { key: 'policeReportDocument', type: 'POLICE_REPORT', label: 'Police Report' },
        { key: 'myKadFront', type: 'MYKAD_FRONT', label: 'MyKad Front' },
        {
          key: 'vehicleRegistrationCard',
          type: 'VEHICLE_REG_CARD',
          label: 'Vehicle Registration Card',
        },
        { key: 'workshopQuotation', type: 'REPAIR_QUOTATION', label: 'Workshop Quotation' },
      ];

      otherDocs.forEach(doc => {
        if (data[doc.key]) {
          uploadTasks.push({
            file: data[doc.key],
            type: doc.type,
            label: doc.label,
          });
        }
      });

      if (uploadTasks.length > 0) {
        console.log(`Starting parallel upload for ${uploadTasks.length} files`);
        let completedCount = 0;

        await Promise.all(
          uploadTasks.map(async task => {
            const formData = new FormData();
            formData.append('type', task.type);
            formData.append('file', task.file);

            try {
              await apiClient.post(`/claims/${claim.id}/documents/upload`, formData, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                },
              });
              completedCount++;
              setUploadProgress({
                current: completedCount,
                total: uploadTasks.length,
                message: `Uploading ${task.label}... (${completedCount}/${uploadTasks.length})`,
              });
            } catch (err) {
              console.error(`Failed to upload ${task.label}:`, err);
              completedCount++;
            }
          })
        );
      }

      toast({
        title: 'Success',
        description: `Claim created successfully`,
      });

      navigate('/claims');
    } catch (error: any) {
      console.error('Failed to create claim:', error);
      const errorMessage =
        error?.response?.data?.message || 'Failed to create claim. Please try again.';
      alert(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Create New Claim"
        description="Assist a claimant by initiating their claim file."
      >
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} disabled={isSubmitting}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="mx-auto">
          <div className="bg-card rounded-lg border shadow-sm p-8">
            {isSubmitting ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Submitting claim details...</p>
              </div>
            ) : (
              <ClaimSubmissionWizard
                mode="AGENT"
                onSuccess={handleSuccess}
                onCancel={() => navigate(-1)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
