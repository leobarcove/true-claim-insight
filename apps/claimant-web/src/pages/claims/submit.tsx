import { useNavigate } from 'react-router-dom';
import { ClaimSubmissionWizard } from '@tci/ui-components';
import { ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';

export function SubmitClaimPage() {
  const navigate = useNavigate();

  const handleSuccess = async (data: any) => {
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
        description: data.description || 'Claim submitted via Mobile Web',
        claimantId: user?.id,
        claimantNric: data.nric,
        nric: data.nric,
        tenantId: user?.tenantId,
        vehiclePlateNumber: data.vehiclePlate,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
      };

      console.log('Submitting claim:', payload);
      const response = await apiClient.post('/claims', payload);
      const claim = response.data.data;

      // Upload Photos
      if (data.photos && data.photos.length > 0) {
        for (const photo of data.photos) {
          const formData = new FormData();
          formData.append('type', 'DAMAGE_PHOTO');
          formData.append('file', photo);
          await apiClient.post(`/claims/${claim.id}/documents/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      }

      // Helper to upload single document
      const uploadDoc = async (file: File | null, type: string) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('type', type);
        formData.append('file', file);
        await apiClient.post(`/claims/${claim.id}/documents/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      };

      await uploadDoc(data.policyDocument, 'SIGNED_STATEMENT');
      await uploadDoc(data.policeReportDocument, 'POLICE_REPORT');
      await uploadDoc(data.myKadFront, 'MYKAD_FRONT');
      await uploadDoc(data.vehicleRegistrationCard, 'VEHICLE_REG_CARD');
      await uploadDoc(data.workshopQuotation, 'REPAIR_QUOTATION');

      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to submit claim:', error);
      alert('Failed to submit claim. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Mobile Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">Submit New Claim</h1>
      </header>

      <main className="px-4 py-6">
        <ClaimSubmissionWizard
          mode="CLAIMANT"
          onSuccess={handleSuccess}
          onCancel={() => navigate(-1)}
        />
      </main>
    </div>
  );
}
