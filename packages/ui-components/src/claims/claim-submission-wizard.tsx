import { 
  ClipboardCheck, 
  Car, 
  AlertCircle, 
  MapPin, 
  Camera, 
  ChevronRight, 
  CheckCircle2,
  Search,
  User
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Simple internal components to avoid external dependencies for now
const Button = ({ children, className, variant = 'default', ...props }: any) => {
  const variants: any = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700',
    ghost: 'hover:bg-gray-100 text-gray-600',
  };
  return (
    <button 
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2",
        variants[variant],
        className
      )} 
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({ label, error, ...props }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input 
      className={cn(
        "w-full px-3 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all",
        error && "border-red-500 ring-1 ring-red-500"
      )} 
      {...props} 
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

type WizardMode = 'CLAIMANT' | 'AGENT';

interface ClaimSubmissionWizardProps {
  mode: WizardMode;
  onSuccess: (data: any) => void;
  onCancel?: () => void;
}

export function ClaimSubmissionWizard({ mode, onSuccess, onCancel }: ClaimSubmissionWizardProps) {
  const [step, setStep] = useState(mode === 'AGENT' ? 1 : 2);
  const [formData, setFormData] = useState({
    claimantId: '',
    mobileNumber: '',
    nric: '',
    vehiclePlate: '',
    vehicleMake: '',
    vehicleModel: '',
    claimType: 'OWN_DAMAGE',
    incidentDate: new Date().toISOString().split('T')[0],
    incidentTime: new Date().toTimeString().slice(0, 5),
    description: '',
    address: '',
    photos: [] as File[],
  });

  const [stepStates] = useState([
    { title: 'Claimant', icon: User, show: mode === 'AGENT' },
    { title: 'Vehicle', icon: Car, show: true },
    { title: 'Incident', icon: AlertCircle, show: true },
    { title: 'Location', icon: MapPin, show: true },
    { title: 'Evidence', icon: Camera, show: true },
    { title: 'Review', icon: ClipboardCheck, show: true },
  ].filter(s => s.show));

  const currentStepIndex = step - (mode === 'AGENT' ? 1 : 2) + (mode === 'AGENT' ? 0 : 1);

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = () => {
    onSuccess(formData);
  };

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Progress Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
        <div className="flex justify-between">
          {stepStates.map((s, idx) => {
            const isActive = idx === currentStepIndex;
            const isCompleted = idx < currentStepIndex;
            const StepIcon = s.icon;
            return (
              <div key={s.title} className="flex flex-col items-center gap-1.5 flex-1 relative">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                  isActive ? "bg-blue-600 text-white ring-4 ring-blue-100" : 
                  isCompleted ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"
                )}>
                  {isCompleted ? <CheckCircle2 size={16} /> : <StepIcon size={14} />}
                </div>
                <span className={cn(
                  "text-[10px] font-medium uppercase tracking-wider",
                  isActive ? "text-blue-600" : "text-gray-400"
                )}>{s.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {/* Step 1: Claimant (Agent only) */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Claimant Information</h2>
            <p className="text-sm text-gray-500">Search for an existing claimant or enter new details.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Search by NRIC or Phone..." className="pl-9" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <Input 
                label="Full Name" 
                placeholder="As per MyKad" 
                value={formData.claimantId}
                onChange={(e: any) => setFormData({...formData, claimantId: e.target.value})}
              />
              <Input 
                label="NRIC Number" 
                placeholder="880101-14-1234" 
                value={formData.nric}
                onChange={(e: any) => setFormData({...formData, nric: e.target.value})}
              />
              <Input 
                label="Mobile Number" 
                placeholder="+60123456789" 
                value={formData.mobileNumber}
                onChange={(e: any) => setFormData({...formData, mobileNumber: e.target.value})}
              />
            </div>
          </div>
        )}

        {/* Step 2: Vehicle */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Vehicle Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Plate Number" 
                placeholder="ABC 1234" 
                value={formData.vehiclePlate}
                onChange={(e: any) => setFormData({...formData, vehiclePlate: e.target.value})}
              />
              <Input 
                label="Year" 
                placeholder="2022" 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Make" 
                placeholder="Perodua" 
                value={formData.vehicleMake}
                onChange={(e: any) => setFormData({...formData, vehicleMake: e.target.value})}
              />
              <Input 
                label="Model" 
                placeholder="Myvi" 
                value={formData.vehicleModel}
                onChange={(e: any) => setFormData({...formData, vehicleModel: e.target.value})}
              />
            </div>
          </div>
        )}

        {/* Step 3: Incident */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Incident Details</h2>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Claim Type</label>
              <select 
                className="w-full px-3 py-2 rounded-md border border-gray-300 outline-none"
                value={formData.claimType}
                onChange={(e) => setFormData({...formData, claimType: e.target.value})}
              >
                <option value="OWN_DAMAGE">Own Damage</option>
                <option value="THIRD_PARTY_PROPERTY">Third Party Property Damage</option>
                <option value="THEFT">Theft</option>
                <option value="WINDSCREEN">Windscreen</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input 
                label="Date" 
                type="date"
                value={formData.incidentDate}
                onChange={(e: any) => setFormData({...formData, incidentDate: e.target.value})}
              />
              <Input 
                label="Time" 
                type="time" 
                value={formData.incidentTime}
                onChange={(e: any) => setFormData({...formData, incidentTime: e.target.value})}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <textarea 
                className="w-full px-3 py-2 rounded-md border border-gray-300 outline-none h-24 resize-none"
                placeholder="Explain what happened..."
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>
          </div>
        )}

        {/* Step 4: Location */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Incident Location</h2>
            <Input 
              label="Search Address" 
              placeholder="Jalan Bukit Bintang..." 
              value={formData.address}
              onChange={(e: any) => setFormData({...formData, address: e.target.value})}
            />
            <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center border border-dashed border-gray-300">
              <div className="text-center text-gray-400">
                <MapPin size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Map View Integration Placeholder</p>
                <p className="text-xs">GPS coordinates will be captured automatically</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Photos */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Damage Evidence</h2>
            <p className="text-sm text-gray-500">Upload photos of the accident scene and damage. At least 2 photos required.</p>
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="aspect-square bg-gray-50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-all">
                  <Camera size={24} className="text-gray-400 mb-1" />
                  <span className="text-[10px] text-gray-500">Add Photo</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 6: Review */}
        {step === 6 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Review Submission</h2>
            <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Claimant</span>
                <span className="font-medium">{formData.claimantId || 'Self'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Vehicle</span>
                <span className="font-medium">{formData.vehiclePlate}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{formData.claimType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Incident</span>
                <span className="font-medium">{formData.incidentDate} at {formData.incidentTime}</span>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
              <AlertCircle className="text-blue-600 shrink-0" size={20} />
              <p className="text-xs text-blue-800 leading-relaxed">
                By submitting, you confirm that the information provided is accurate. 
                {mode === 'AGENT' ? 
                  " The claimant will receive an SMS to verify their identity via V-KYC during the assessment call." : 
                  " You will be asked to verify your identity using your MyKad during the video call with our adjuster."
                }
              </p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <Button 
            variant="ghost" 
            onClick={step === (mode === 'AGENT' ? 1 : 2) ? onCancel : handleBack}
          >
            {step === (mode === 'AGENT' ? 1 : 2) ? 'Cancel' : 'Back'}
          </Button>
          
          <Button 
            className="flex-1"
            onClick={step === 6 ? handleSubmit : handleNext}
          >
            {step === 6 ? 'Submit Claim' : 'Continue'}
            {step !== 6 && <ChevronRight size={18} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
