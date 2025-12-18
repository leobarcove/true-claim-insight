import { useState, useRef } from 'react';
import { 
  ClipboardCheck, 
  Car, 
  AlertCircle, 
  MapPin, 
  Camera, 
  ChevronRight, 
  CheckCircle2,
  Search,
  User,
  Sparkles,
  Loader2,
  Check
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAiExtraction } from '../hooks/use-ai-extraction';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Simple internal components to avoid external dependencies for now
const Button = ({ children, className, variant = 'default', ...props }: any) => {
  const variants: any = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700',
    ghost: 'hover:bg-gray-100 text-gray-600',
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200',
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

const Input = ({ label, error, aiFilled, ...props }: any) => (
  <div className="space-y-1.5 relative">
    <div className="flex justify-between items-center">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      {aiFilled && (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 animate-pulse">
          <Sparkles size={10} /> AI FILLED
        </span>
      )}
    </div>
    <input 
      className={cn(
        "w-full px-3 py-2 rounded-md border transition-all outline-none",
        aiFilled ? "border-amber-300 bg-amber-50 focus:ring-amber-500" : "border-gray-300 focus:ring-blue-500",
        error ? "border-red-500 ring-1 ring-red-500" : "focus:ring-2 focus:border-transparent"
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
  // Step 0 is the Selection Screen (AI vs Manual)
  // Agents start at Step 0. Claimants skip to Step 2 (Vehicle) directly.
  const [step, setStep] = useState(() => {
    const initialStep = mode === 'AGENT' ? 0 : 2;
    console.log('[Wizard] Initializing. Mode:', mode, 'Initial Step:', initialStep);
    return initialStep;
  });
  const [formData, setFormData] = useState<any>({
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

  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const { extractData, isExtracting } = useAiExtraction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stepper labels (only for steps 1-6)
  const stepStates = [
    { title: 'Claimant', icon: User, show: mode === 'AGENT' },
    { title: 'Vehicle', icon: Car, show: true },
    { title: 'Incident', icon: AlertCircle, show: true },
    { title: 'Location', icon: MapPin, show: true },
    { title: 'Evidence', icon: Camera, show: true },
    { title: 'Review', icon: ClipboardCheck, show: true },
  ].filter((s: any) => s.show);

  // Calculate current index in the filtered stepper (1-indexed for the UI circles)
  const currentStepperIndex = step - (mode === 'AGENT' ? 1 : 2) + (mode === 'AGENT' ? 0 : 1);

  const handleNext = () => setStep((s: number) => s + 1);
  const handleBack = () => {
    if (step === 1 && mode === 'AGENT') {
      setStep(0);
    } else {
      setStep((s: number) => s - 1);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await extractData(file);
    
    setFormData((prev: any) => ({
      ...prev,
      claimantId: data.claimantName || prev.claimantId,
      nric: data.nric || prev.nric,
      mobileNumber: data.mobileNumber || prev.mobileNumber,
      vehiclePlate: data.vehiclePlate || prev.vehiclePlate,
      vehicleMake: data.vehicleMake || prev.vehicleMake,
      vehicleModel: data.vehicleModel || prev.vehicleModel,
      incidentDate: data.incidentDate || prev.incidentDate,
      incidentTime: data.incidentTime || prev.incidentTime,
      description: data.description || prev.description,
    }));

    const filled = new Set<string>();
    if (data.claimantName) filled.add('claimantId');
    if (data.nric) filled.add('nric');
    if (data.mobileNumber) filled.add('mobileNumber');
    if (data.vehiclePlate) filled.add('vehiclePlate');
    if (data.vehicleMake) filled.add('vehicleMake');
    if (data.vehicleModel) filled.add('vehicleModel');
    if (data.incidentDate) filled.add('incidentDate');
    if (data.incidentTime) filled.add('incidentTime');
    if (data.description) filled.add('description');
    setAiFilledFields(filled);

    // After AI extraction, go to Step 1 (Agent) or Step 2 (Claimant)
    setStep(mode === 'AGENT' ? 1 : 2);
  };

  const handleSubmit = () => {
    onSuccess(formData);
  };

  // Selection View (Step 0)
  if (step === 0 && mode === 'AGENT') {
    return (
      <div className="max-w-xl mx-auto space-y-8 py-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">How would you like to start?</h2>
          <p className="text-gray-500">Pick an entry method for the new claim.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={() => setStep(1)}
            className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
              <User className="text-gray-500 group-hover:text-blue-600" size={32} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg">Manual Entry</h3>
              <p className="text-xs text-gray-500 mt-1">Fill in details step-by-step</p>
            </div>
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-blue-100 bg-blue-50/30 hover:border-blue-500 hover:bg-blue-50 transition-all group relative overflow-hidden"
          >
            {isExtracting && (
              <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 animate-in fade-in">
                <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
                <span className="text-xs font-bold text-blue-600 uppercase tracking-widest">Extracting...</span>
              </div>
            )}
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Sparkles className="text-white" size={32} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg">AI Import</h3>
              <p className="text-xs text-gray-500 mt-1">Upload MyKad or Police Report</p>
            </div>
            <div className="mt-2 px-3 py-1 bg-blue-600 text-[10px] font-bold text-white rounded-full">
              RECOMMENDED
            </div>
          </button>
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileUpload}
          accept="image/*,.pdf"
        />

        <div className="text-center">
          <Button variant="ghost" onClick={onCancel} className="text-gray-400">
            Cancel and Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Progress Header */}
      <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
        <div className="flex justify-between">
          {stepStates.map((s: any, idx: number) => {
            const isActive = idx === currentStepperIndex;
            const isCompleted = idx < currentStepperIndex;
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
                aiFilled={aiFilledFields.has('claimantId')}
                onChange={(e: any) => {
                  setFormData({...formData, claimantId: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('claimantId');
                    return next;
                  });
                }}
              />
              <Input 
                label="NRIC Number" 
                placeholder="880101-14-1234" 
                value={formData.nric}
                aiFilled={aiFilledFields.has('nric')}
                onChange={(e: any) => {
                  setFormData({...formData, nric: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('nric');
                    return next;
                  });
                }}
              />
              <Input 
                label="Mobile Number" 
                placeholder="+60123456789" 
                value={formData.mobileNumber}
                aiFilled={aiFilledFields.has('mobileNumber')}
                onChange={(e: any) => {
                  setFormData({...formData, mobileNumber: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('mobileNumber');
                    return next;
                  });
                }}
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
                aiFilled={aiFilledFields.has('vehiclePlate')}
                onChange={(e: any) => {
                  setFormData({...formData, vehiclePlate: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('vehiclePlate');
                    return next;
                  });
                }}
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
                aiFilled={aiFilledFields.has('vehicleMake')}
                onChange={(e: any) => {
                  setFormData({...formData, vehicleMake: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('vehicleMake');
                    return next;
                  });
                }}
              />
              <Input 
                label="Model" 
                placeholder="Myvi" 
                value={formData.vehicleModel}
                aiFilled={aiFilledFields.has('vehicleModel')}
                onChange={(e: any) => {
                  setFormData({...formData, vehicleModel: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('vehicleModel');
                    return next;
                  });
                }}
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
                aiFilled={aiFilledFields.has('incidentDate')}
                onChange={(e: any) => {
                  setFormData({...formData, incidentDate: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('incidentDate');
                    return next;
                  });
                }}
              />
              <Input 
                label="Time" 
                type="time" 
                value={formData.incidentTime}
                aiFilled={aiFilledFields.has('incidentTime')}
                onChange={(e: any) => {
                  setFormData({...formData, incidentTime: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('incidentTime');
                    return next;
                  });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700">Description</label>
                {aiFilledFields.has('description') && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <Sparkles size={10} /> AI GENERATED
                  </span>
                )}
              </div>
              <textarea 
                className={cn(
                  "w-full px-3 py-2 rounded-md border outline-none h-24 resize-none transition-all",
                  aiFilledFields.has('description') ? "border-amber-300 bg-amber-50 focus:ring-amber-500" : "border-gray-300 focus:ring-blue-500"
                )}
                placeholder="Explain what happened..."
                value={formData.description}
                onChange={(e) => {
                  setFormData({...formData, description: e.target.value});
                  setAiFilledFields(prev => {
                    const next = new Set(prev);
                    next.delete('description');
                    return next;
                  });
                }}
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
            onClick={handleBack}
          >
            {step === (mode === 'AGENT' ? 1 : 2) ? 'Cancel' : 'Back'}
          </Button>
          
          <div className="flex-1 flex gap-3">
            {aiFilledFields.size > 0 && (
              <Button 
                variant="outline"
                className="group border-amber-200 hover:bg-amber-50"
                onClick={() => setAiFilledFields(new Set())}
              >
                <Check size={18} className="text-amber-500 group-hover:scale-110 transition-transform" />
                <span className="text-amber-700">Verify All AI</span>
              </Button>
            )}
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
    </div>
  );
}
