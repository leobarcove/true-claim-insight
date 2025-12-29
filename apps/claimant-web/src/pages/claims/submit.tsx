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
          address: data.address || 'Unknown Location',
          latitude: 3.1478,
          longitude: 101.7128,
        },
        description: data.description || 'Claim submitted via Mobile Web',
        claimantId: user?.id || 'demo-claimant-id',
        tenantId: 'allianz-id', // Default to Allianz for MVP
        vehiclePlateNumber: data.vehiclePlate,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
      };

      console.log('Submitting claim:', payload);
      await apiClient.post('/claims', payload);
      
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
