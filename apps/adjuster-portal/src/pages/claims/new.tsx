import { useNavigate } from 'react-router-dom';
import { ClaimSubmissionWizard } from '@tci/ui-components';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/layout/header';

export function NewClaimPage() {
  const navigate = useNavigate();

  const handleSuccess = (data: any) => {
    console.log('Claim created by agent:', data);
    // In a real app, we would call an API here to create the claim and assign it
    navigate('/claims');
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
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to List
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-lg border shadow-sm p-8">
            <ClaimSubmissionWizard 
              mode="AGENT" 
              onSuccess={handleSuccess}
              onCancel={() => navigate(-1)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
