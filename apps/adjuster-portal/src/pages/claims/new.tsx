import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClaimSubmissionWizard } from '@tci/ui-components';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/hooks/use-toast';
import { useVehicleMakes, VehicleModel } from '@/hooks/use-master-data';
import { ApiResponse } from '@/lib/api-client';

export function NewClaimPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuccess = async (data: any) => {
    setIsSubmitting(true);
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

      // Handle document/photo uploads if any
      if (data.photos && data.photos.length > 0) {
        console.log(`Uploading ${data.photos.length} photos for claim ${claim.id}`);
        for (const photo of data.photos) {
          const formData = new FormData();
          formData.append('type', 'DAMAGE_PHOTO'); // Append fields before files
          formData.append('file', photo);
          await apiClient.post(`/claims/${claim.id}/documents/upload`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        }
      }

      // Upload Policy Document
      if (data.policyDocument) {
        console.log(`Uploading policy document for claim ${claim.id}`);
        const formData = new FormData();
        // Using SIGNED_STATEMENT as the closest match for Policy Document from available enums
        formData.append('type', 'SIGNED_STATEMENT');
        formData.append('file', data.policyDocument);
        await apiClient.post(`/claims/${claim.id}/documents/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      // Upload Police Report
      if (data.policeReportDocument) {
        console.log(`Uploading police report for claim ${claim.id}`);
        const formData = new FormData();
        formData.append('type', 'POLICE_REPORT');
        formData.append('file', data.policeReportDocument);
        await apiClient.post(`/claims/${claim.id}/documents/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      toast({
        title: 'Success',
        description: `Claim created successfully!`,
      });

      navigate('/claims');
    } catch (error: any) {
      console.error('Failed to create claim:', error);
      const errorMessage =
        error?.response?.data?.message || 'Failed to create claim. Please try again.';
      alert(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const { data: makes } = useVehicleMakes();

  const fetchModels = async (makeId: string) => {
    const { data } = await apiClient.get<ApiResponse<VehicleModel[]>>(
      '/master-data/vehicles/models',
      {
        params: { makeId },
      }
    );
    return data.data;
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
                vehicleMasterData={
                  makes
                    ? {
                        makes,
                        fetchModels,
                      }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
