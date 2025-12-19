import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClaimSubmissionWizard } from '@tci/ui-components';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';
import { apiClient } from '@/lib/api-client';

export function NewClaimPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSuccess = async (data: any) => {
    setIsSubmitting(true);
    try {
      // Map wizard data to case-service CreateClaimDto
      // For MVP, we use fixed UUIDs from seeded data
      // In production, these would come from the user session
      const payload = {
        claimType: data.claimType || 'OWN_DAMAGE',
        incidentDate: data.incidentDate || new Date().toISOString().split('T')[0],
        incidentLocation: {
          address: data.address || 'Jalan Bukit Bintang, Kuala Lumpur',
          latitude: 3.1478,
          longitude: 101.7128,
        },
        description: data.description || 'Claim submitted via AI Import',
        // Using actual claimant UUID from the database
        claimantId: '5ee7b6db-9c6f-4a49-a0a2-4faddab15403', // Actual claimant UUID
        tenantId: 'test-tenant-id', // Seeded tenant ID
        policyNumber: data.vehiclePlate || '',
      };

      console.log('Submitting claim payload:', payload);

      await apiClient.post('/claims', payload);
      
      console.log('Claim created successfully');
      alert('Claim created successfully!');
      
      navigate('/claims');
    } catch (error: any) {
      console.error('Failed to create claim:', error);
      const errorMessage = error?.response?.data?.message || 'Failed to create claim. Please try again.';
      alert(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header 
        title="Create New Claim" 
        description="Assist a claimant by initiating their claim file."
      >
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate(-1)}
          disabled={isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to List
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-lg border shadow-sm p-8">
            {isSubmitting ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-500">Submitting claim details...</p>
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
