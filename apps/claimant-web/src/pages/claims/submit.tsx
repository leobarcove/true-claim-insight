import { useNavigate } from 'react-router-dom';
import { ClaimSubmissionWizard } from '@tci/ui-components';
import { ArrowLeft } from 'lucide-react';

export function SubmitClaimPage() {
  const navigate = useNavigate();

  const handleSuccess = (data: any) => {
    console.log('Claim submitted:', data);
    // In a real app, we would call an API here
    // For now, we'll just redirect back to dashboard
    navigate('/dashboard');
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
