import { useState, useRef, useEffect } from 'react';
import {
  ClipboardCheck,
  Car,
  AlertCircle,
  MapPin,
  Camera,
  ChevronRight,
  Search,
  User,
  Sparkles,
  Loader2,
  Check,
  X,
  Upload,
  ImageIcon,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAiExtraction } from '../hooks/use-ai-extraction';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ================= CONSTANTS & DATA =================

const MALAYSIA_CARS: Record<string, string[]> = {
  Perodua: ['Myvi', 'Axia', 'Bezza', 'Alza', 'Aruz', 'Ativa', 'Traz'],
  Proton: ['Saga', 'Persona', 'Iriz', 'Exora', 'X50', 'X70', 'X90', 'S70'],
  Honda: ['City', 'Civic', 'HR-V', 'CR-V', 'Jazz', 'City Hatchback', 'WR-V', 'Accord'],
  Toyota: ['Vios', 'Yaris', 'Corolla Cross', 'Hilux', 'Veloz', 'Camry', 'Innova', 'Fortuner'],
  Mazda: ['2', '3', '6', 'CX-3', 'CX-30', 'CX-5', 'CX-8', 'BT-50'],
  Nissan: ['Almera', 'Serena', 'X-Trail', 'Navara'],
  BMW: ['3 Series', '5 Series', 'X1', 'X3', 'X5', 'iX3', 'iX'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'EQA', 'EQE'],
  BYD: ['Atto 3', 'Dolphin', 'Seal'],
  Tesla: ['Model 3', 'Model Y'],
  Kia: ['Carnival', 'Sorento', 'Sportage'],
  Hyundai: ['Tucson', 'Santa Fe', 'Ioniq 5', 'Ioniq 6'],
  Chery: ['Omoda 5', 'Tiggo 8 Pro'],
  ORA: ['Good Cat'],
};

const CLAIM_TYPES: Record<string, string> = {
  OWN_DAMAGE: 'Own Damage',
  THIRD_PARTY_PROPERTY: 'Third Party Property Damage',
  THEFT: 'Theft',
  WINDSCREEN: 'Windscreen',
};

// ================= INTERNAL COMPONENTS =================

const Button = ({ children, className, variant = 'default', ...props }: any) => {
  const variants: any = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm active:scale-95 text-sm',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm',
    ghost: 'hover:bg-gray-100 text-gray-600 text-sm',
    primary: 'bg-blue-600 text-white hover:bg-blue-700 text-sm',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 text-sm',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm',
  };
  return (
    <button
      className={cn(
        'px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({
  label,
  error,
  aiFilled,
  className,
  containerClassName,
  onBlur,
  ...props
}: any) => (
  <div className={cn('space-y-1.5 relative', containerClassName)}>
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
        'w-full px-3 py-2.5 rounded-lg border text-sm transition-all outline-none',
        aiFilled
          ? 'border-amber-300 bg-amber-50/50 focus:ring-amber-500'
          : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
        error ? 'border-red-500 focus:border-red-500 focus:ring-red-100' : '',
        className
      )}
      onBlur={onBlur}
      {...props}
    />
    {error && (
      <p className="text-xs text-red-500 flex items-center gap-1">
        <AlertCircle size={10} /> {error}
      </p>
    )}
  </div>
);

const AutocompleteInput = ({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  error,
  aiFilled,
  onBlur,
}: any) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInput = (e: any) => {
    const val = e.target.value;
    onChange(val);
    if (val.length > 0) {
      const matches = suggestions.filter((s: string) =>
        s.toLowerCase().includes(val.toLowerCase())
      );
      setFiltered(matches);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setShowSuggestions(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <Input
        label={label}
        value={value}
        onChange={handleInput}
        placeholder={placeholder}
        error={error}
        aiFilled={aiFilled}
        onFocus={() => value && handleInput({ target: { value } })}
        onBlur={onBlur}
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-20 w-full bg-white mt-1 border border-gray-100 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(item => (
            <div
              key={item}
              className="px-4 py-2 hover:bg-gray-50 cursor-pointer text-sm"
              onClick={() => handleSelect(item)}
            >
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ================= MAIN WIZARD COMPONENT =================

type WizardMode = 'CLAIMANT' | 'AGENT';

interface ClaimSubmissionWizardProps {
  mode: WizardMode;
  onSuccess: (data: any) => void;
  onCancel?: () => void;
}

export function ClaimSubmissionWizard({ mode, onSuccess, onCancel }: ClaimSubmissionWizardProps) {
  // Step 0 is the Selection Screen (AI vs Manual)
  const [step, setStep] = useState(() => {
    const initialStep = mode === 'AGENT' ? 0 : 2;
    return initialStep;
  });

  const [formData, setFormData] = useState<any>({
    claimantId: '',
    mobileNumber: '',
    nric: '',
    vehiclePlate: '',
    vehicleYear: '',
    vehicleMake: '',
    vehicleModel: '',
    claimType: 'OWN_DAMAGE',
    incidentDate: new Date().toISOString().split('T')[0],
    incidentTime: new Date().toTimeString().slice(0, 5),
    description: '',
    address: '',
    photos: [] as File[],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const { extractData, isExtracting } = useAiExtraction();
  // const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  // Step 5 Evidence States
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState<number | null>(null);
  const [photoToRemoveIndex, setPhotoToRemoveIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(true);

  // Location Suggestion State
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);

  const [isAiImportActive, setIsAiImportActive] = useState(false);
  const [aiImportFiles, setAiImportFiles] = useState<{ [key: string]: File | null }>({
    mykad: null,
    damaged_evidence: null,
    police_report: null,
  });
  const [aiExtractionError, setAiExtractionError] = useState<string | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        addressContainerRef.current &&
        !addressContainerRef.current.contains(event.target as Node)
      ) {
        setShowAddressSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stepper labels
  const stepStates = [
    { title: 'Claimant', icon: User, show: mode === 'AGENT' },
    { title: 'Vehicle', icon: Car, show: true },
    { title: 'Incident', icon: AlertCircle, show: true },
    { title: 'Location', icon: MapPin, show: true },
    { title: 'Evidence', icon: Camera, show: true },
    { title: 'Review', icon: ClipboardCheck, show: true },
  ].filter((s: any) => s.show);

  const currentStepperIndex = step - (mode === 'AGENT' ? 1 : 2) + (mode === 'AGENT' ? 0 : 1);

  // ================= VALIDATION LOGIC =================

  const validateField = (name: string, value: any) => {
    let error = '';

    switch (name) {
      case 'claimantId':
        if (!value?.trim()) error = 'Name is required';
        break;
      case 'nric':
        if (!value?.trim()) error = 'NRIC is required';
        else if (!/^\d{6}-\d{2}-\d{4}$/.test(value) && !/^\d{12}$/.test(value))
          error = 'Invalid NRIC format (e.g. 880101-12-1234)';
        break;
      case 'mobileNumber':
        if (!value?.trim()) error = 'Mobile number is required';
        break;
      case 'vehiclePlate':
        if (!value?.trim()) error = 'Plate number is required';
        break;
      case 'vehicleMake':
        if (!value?.trim()) error = 'Make is required';
        break;
      case 'vehicleModel':
        if (!value?.trim()) error = 'Model is required';
        break;
      case 'incidentDate':
        if (!value) error = 'Date is required';
        break;
      case 'incidentTime':
        if (!value) error = 'Time is required';
        break;
      case 'description':
        if (!value?.trim()) error = 'Description is required';
        else if (value.length < 20) error = 'Please provide more detail (min 20 chars)';
        break;
      case 'address':
        if (!value?.trim()) error = 'Location is required';
        break;
      case 'photos':
        if (value.length < 2) error = 'Please upload at least 2 photos';
        break;
    }

    setErrors(prev => {
      const next = { ...prev };
      if (error) next[name] = error;
      else delete next[name];
      return next;
    });
    return !error;
  };

  const handleBlur = (name: string) => {
    // setTouchedFields(prev => new Set(prev).add(name));
    validateField(name, formData[name]);
  };

  const validateStep = (currentStep: number) => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    if (currentStep === 1) {
      // Claimant
      if (!formData.claimantId.trim()) newErrors.claimantId = 'Name is required';
      if (!formData.nric.trim()) newErrors.nric = 'NRIC is required';
      // Basic NRIC validation (regex)
      else if (!/^\d{6}-\d{2}-\d{4}$/.test(formData.nric) && !/^\d{12}$/.test(formData.nric))
        newErrors.nric = 'Invalid NRIC format (e.g. 880101-12-1234)';

      if (!formData.mobileNumber.trim()) newErrors.mobileNumber = 'Mobile number is required';
    }

    if (currentStep === 2) {
      // Vehicle
      if (!formData.vehiclePlate.trim()) newErrors.vehiclePlate = 'Plate number is required';
      if (!formData.vehicleMake.trim()) newErrors.vehicleMake = 'Make is required';
      if (!formData.vehicleModel.trim()) newErrors.vehicleModel = 'Model is required';
    }

    if (currentStep === 3) {
      // Incident
      if (!formData.incidentDate) newErrors.incidentDate = 'Date is required';
      if (!formData.incidentTime) newErrors.incidentTime = 'Time is required';
      if (!formData.description.trim()) newErrors.description = 'Description is required';
      else if (formData.description.length < 20)
        newErrors.description = 'Please provide more detail (min 20 chars)';
    }

    if (currentStep === 4) {
      // Location
      if (!formData.address.trim()) newErrors.address = 'Location is required';
    }

    if (currentStep === 5) {
      // Photos
      if (formData.photos.length < 2) newErrors.photos = 'Please upload at least 2 photos';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      isValid = false;
    } else {
      setErrors({});
    }

    return isValid;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((s: number) => s + 1);
    }
  };

  const handleBack = () => {
    if (step === 1 && mode === 'AGENT') {
      setStep(0);
    } else {
      setStep((s: number) => s - 1);
    }
  };

  // ================= HANDLERS =================

  const handleAiImportSubmit = async () => {
    const hasFiles = Object.values(aiImportFiles).some(f => f !== null);
    if (!hasFiles) return;

    setAiExtractionError(null);
    const extraction = await extractData(aiImportFiles);

    // Check if we got any valid extraction data
    const hasData = Object.keys(extraction).length > 0;

    if (!hasData) {
      setAiExtractionError(
        'Extraction failed. Please try again, or use manual entry if the issue persists.'
      );
      return;
    }

    const filled = new Set<string>();
    const newFormData = { ...formData };

    // Process MyKad
    if (extraction.mykad?.document) {
      const front = extraction.mykad.document.front;
      if (front) {
        if (front.name) {
          newFormData.claimantId = front.name;
          filled.add('claimantId');
        }
        if (front.nric) {
          newFormData.nric = front.nric;
          filled.add('nric');
        }
        if (front.address?.full_address) {
          newFormData.address = front.address.full_address;
          filled.add('address');
        }
      }
    }

    // Process Damaged Evidence (Vehicle details)
    if (extraction.damaged_evidence?.document) {
      const data = extraction.damaged_evidence.document;
      if (data.vehicle_plate) {
        newFormData.vehiclePlate = data.vehicle_plate;
        filled.add('vehiclePlate');
      }
      if (data.vehicle_make) {
        newFormData.vehicleMake = data.vehicle_make;
        filled.add('vehicleMake');
      }
      if (data.vehicle_model) {
        newFormData.vehicleModel = data.vehicle_model;
        filled.add('vehicleModel');
      }
      if (data.incident_date) {
        newFormData.incidentDate = data.incident_date;
        filled.add('incidentDate');
      }
      if (data.incident_time) {
        newFormData.incidentTime = data.incident_time;
        filled.add('incidentTime');
      }
    }

    // Process Police Report
    if (extraction.police_report?.document) {
      const data = extraction.police_report.document;
      if (data.report?.incident?.narrative) {
        newFormData.description = data.report.incident.narrative;
        filled.add('description');
      }
      if (data.report?.incident?.incident_date && !newFormData.incidentDate) {
        newFormData.incidentDate = data.report.incident.incident_date;
        filled.add('incidentDate');
      }
      if (data.report?.incident?.incident_time && !newFormData.incidentTime) {
        newFormData.incidentTime = data.report.incident.incident_time;
        filled.add('incidentTime');
      }
    }

    setFormData(newFormData);
    setAiFilledFields(filled);
    setIsAiImportActive(false);
    setStep(mode === 'AGENT' ? 1 : 2);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newPhotos = Array.from(e.target.files);
      // Validate types
      const validPhotos = newPhotos.filter(f => f.type.startsWith('image/'));

      setFormData((prev: any) => {
        const totalPhotos = prev.photos.length + validPhotos.length;
        if (totalPhotos > 10) {
          setErrors(e => ({ ...e, photos: 'Maximum 10 photos allowed' }));
          return prev;
        }
        return {
          ...prev,
          photos: [...prev.photos, ...validPhotos],
        };
      });

      // Clear error if resolved
      if (formData.photos.length + validPhotos.length >= 2) {
        setErrors(e => {
          const next = { ...e };
          delete next.photos;
          return next;
        });
      }
    }
  };

  const removePhoto = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      photos: prev.photos.filter((_: any, i: number) => i !== index),
    }));
  };

  // Debounce logic for address search
  useEffect(() => {
    const timer = setTimeout(async () => {
      const query = formData.address;
      if (query && query.length > 2 && showAddressSuggestions) {
        try {
          const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';
          const res = await fetch(`${baseUrl}/location/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const json = await res.json();
            // API Gateway Standard Response: { success: true, data: [...], meta: ... }
            const suggestions = (json.data || []).map((item: any) => item.displayName);
            setAddressSuggestions(suggestions);
          }
        } catch (e) {
          console.error('Failed to fetch address suggestions', e);
        }
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [formData.address, showAddressSuggestions]);

  const handleAddressSearch = (e: any) => {
    const val = e.target.value;
    setFormData({ ...formData, address: val });

    if (val.length > 2) {
      setShowAddressSuggestions(true);
      // Actual fetch is handled by useEffect to debounce
    } else {
      setShowAddressSuggestions(false);
    }
  };

  const selectAddress = (addr: string) => {
    setFormData({ ...formData, address: addr });
    setShowAddressSuggestions(false);
    setErrors(e => {
      const next = { ...e };
      delete next.address;
      return next;
    });
  };

  const fillDemoData = () => {
    setFormData({
      ...formData,
      claimantId: 'Ahmad bin Zulkifli',
      nric: '850512-14-5567',
      mobileNumber: '+60123456789',
      vehiclePlate: 'WQX 9988',
      vehicleMake: 'Proton',
      vehicleModel: 'X50',
      vehicleYear: '2025',
      claimType: 'OWN_DAMAGE',
      description:
        'The vehicle was hit from the rear by a motorcycle while waiting at a traffic light in Kuala Lumpur.',
      address: 'Jalan Bukit Bintang, Kuala Lumpur, Malaysia',
      photos: [], // Photos still need manual upload or mock
    });
    setAiFilledFields(new Set());
    if (step === 0) setStep(1);
  };

  const handleSubmit = () => {
    if (validateStep(step)) {
      onSuccess(formData);
    }
  };

  // ================= VIEW RENDRERING =================

  // Search Step 0 (Selection) is same as before but cleaner
  if (step === 0 && mode === 'AGENT') {
    return (
      <div className="max-w-xl mx-auto space-y-8 py-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">How would you like to start?</h2>
          <p className="text-gray-500">Choose how you want to input the claim details</p>
        </div>

        {isAiImportActive ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {aiExtractionError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-3 text-red-700 text-sm animate-in shake duration-300">
                <AlertCircle size={18} />
                {aiExtractionError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4">
              {[
                {
                  id: 'mykad',
                  label: 'MyKad (Front)',
                  description: 'Identity verification',
                  icon: User,
                  required: true,
                },
                {
                  id: 'damaged_evidence',
                  label: 'Incident Photo',
                  description: 'Photo of the scene/damage',
                  icon: Camera,
                  required: true,
                },
                {
                  id: 'police_report',
                  label: 'Police Report',
                  description: 'Official report document',
                  icon: ClipboardCheck,
                  required: false,
                },
              ].map(slot => (
                <div
                  key={slot.id}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border-2 border-dashed transition-all',
                    aiImportFiles[slot.id]
                      ? 'border-green-200 bg-green-50/50'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
                  )}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,.pdf';
                    input.onchange = (e: any) => {
                      if (e.target.files?.[0]) {
                        setAiImportFiles(prev => ({ ...prev, [slot.id]: e.target.files[0] }));
                      }
                    };
                    input.click();
                  }}
                >
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                      aiImportFiles[slot.id]
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-400'
                    )}
                  >
                    {aiImportFiles[slot.id] ? <Check size={20} /> : <slot.icon size={20} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-900">{slot.label}</h4>
                      {slot.required && (
                        <span className="text-[10px] text-red-500 font-bold uppercase">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {aiImportFiles[slot.id] ? aiImportFiles[slot.id]?.name : slot.description}
                    </p>
                  </div>
                  {aiImportFiles[slot.id] && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setAiImportFiles(prev => ({ ...prev, [slot.id]: null }));
                      }}
                      className="p-1 hover:bg-red-100 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsAiImportActive(false)}>
                Back
              </Button>
              <Button
                onClick={handleAiImportSubmit}
                disabled={isExtracting || !aiImportFiles.mykad || !aiImportFiles.damaged_evidence}
                className="min-w-[160px] shadow-lg shadow-blue-200"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={18} />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="mr-2" />
                    Process AI Import
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Selection Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => setStep(1)}
              className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-gray-100 bg-white hover:border-blue-500 hover:bg-blue-50/50 transition-all group shadow-sm hover:shadow-md"
            >
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <User className="text-gray-500 group-hover:text-blue-600" size={32} />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-lg text-gray-900">Manual Entry</h3>
                <p className="text-sm text-gray-500 mt-1">Fill in details step-by-step</p>
              </div>
            </button>

            <button
              onClick={() => setIsAiImportActive(true)}
              className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-blue-100 bg-blue-50/30 hover:border-blue-500 hover:bg-blue-50 transition-all group relative overflow-hidden shadow-sm hover:shadow-md"
            >
              <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-blue-200 shadow-lg">
                <Sparkles className="text-white" size={28} />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-lg text-gray-900">AI Import</h3>
                <p className="text-sm text-gray-500 mt-1">Upload MyKad & Incident Photos</p>
              </div>
              <div className="mt-4 px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wide rounded-full">
                Recommended
              </div>
            </button>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={fillDemoData}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors shadow-sm"
          >
            <Sparkles size={14} />
            FILL DEMO DATA (SHORTCUT)
          </button>
        </div>

        <div className="text-center pt-2">
          <Button variant="ghost" onClick={onCancel} className="text-gray-400 font-normal">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[600px]">
      {/* Progress Header */}
      <div className="bg-white px-6 py-4 border-b border-gray-100">
        <div className="flex justify-between items-center relative">
          {/* Connecting Line */}
          <div className="absolute top-4 left-0 w-full h-0.5 bg-gray-100 -z-0 translate-y-[-50%] overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${(currentStepperIndex / (stepStates.length - 1)) * 100}%` }}
            />
          </div>

          {stepStates.map((s: any, idx: number) => {
            const isActive = idx === currentStepperIndex;
            const isCompleted = idx < currentStepperIndex;
            const StepIcon = s.icon;
            return (
              <div
                key={s.title}
                className="relative z-10 flex flex-col items-center gap-2 bg-white px-2"
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
                    isActive
                      ? 'bg-blue-600 text-white ring-4 ring-blue-50 scale-110'
                      : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-400 border border-gray-200'
                  )}
                >
                  {isCompleted ? <Check size={14} strokeWidth={3} /> : <StepIcon size={14} />}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider transition-colors',
                    isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-300'
                  )}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-8 flex-1" style={{ minHeight: 'calc(100vh - 350px)' }}>
        {/* Step 1: Claimant (Agent only) */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Claimant Information</h2>
              <p className="text-sm text-gray-500 mt-1">
                Search for an existing claimant or enter new details.
              </p>
            </div>

            <div className="relative group">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10 group-focus-within:text-blue-500 transition-colors"
                style={{ top: '1.7rem' }}
              />
              <Input
                placeholder="Search by NRIC or Phone..."
                className="bg-gray-50 border-transparent focus:bg-white pl-9"
              />
            </div>

            <div className="space-y-4 pt-2">
              <Input
                label="Full Name (as per MyKad)"
                placeholder="e.g. Ahmad bin Zulkifli"
                value={formData.claimantId}
                error={errors.claimantId}
                aiFilled={aiFilledFields.has('claimantId')}
                onChange={(e: any) => setFormData({ ...formData, claimantId: e.target.value })}
                onBlur={() => handleBlur('claimantId')}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="NRIC Number"
                  placeholder="880101-14-1234"
                  value={formData.nric}
                  error={errors.nric}
                  aiFilled={aiFilledFields.has('nric')}
                  onChange={(e: any) => setFormData({ ...formData, nric: e.target.value })}
                  onBlur={() => handleBlur('nric')}
                />
                <Input
                  label="Mobile Number"
                  placeholder="+60123456789"
                  value={formData.mobileNumber}
                  error={errors.mobileNumber}
                  aiFilled={aiFilledFields.has('mobileNumber')}
                  onChange={(e: any) => setFormData({ ...formData, mobileNumber: e.target.value })}
                  onBlur={() => handleBlur('mobileNumber')}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Vehicle */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Vehicle Details</h2>
              <p className="text-sm text-gray-500 mt-1">Vehicle involved in the incident.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Plate Number"
                placeholder="ABC 1234"
                value={formData.vehiclePlate}
                error={errors.vehiclePlate}
                className="uppercase"
                aiFilled={aiFilledFields.has('vehiclePlate')}
                onChange={(e: any) =>
                  setFormData({ ...formData, vehiclePlate: e.target.value.toUpperCase() })
                }
                onBlur={() => handleBlur('vehiclePlate')}
              />
              <Input
                label="Year"
                placeholder="2025"
                value={formData.vehicleYear}
                onChange={(e: any) => setFormData({ ...formData, vehicleYear: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <AutocompleteInput
                label="Make"
                placeholder="Select Make"
                value={formData.vehicleMake}
                suggestions={Object.keys(MALAYSIA_CARS)}
                error={errors.vehicleMake}
                aiFilled={aiFilledFields.has('vehicleMake')}
                onChange={(val: string) =>
                  setFormData({ ...formData, vehicleMake: val, vehicleModel: '' })
                }
                onBlur={() => handleBlur('vehicleMake')}
              />
              <AutocompleteInput
                label="Model"
                placeholder="Select Model"
                value={formData.vehicleModel}
                suggestions={MALAYSIA_CARS[formData.vehicleMake] || []}
                error={errors.vehicleModel}
                aiFilled={aiFilledFields.has('vehicleModel')}
                onChange={(val: string) => setFormData({ ...formData, vehicleModel: val })}
                onBlur={() => handleBlur('vehicleModel')}
              />
            </div>
          </div>
        )}

        {/* Step 3: Incident */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Incident Details</h2>
              <p className="text-sm text-gray-500 mt-1">When and what happened.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Claim Type</label>
              <select
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm bg-white"
                value={formData.claimType}
                onChange={e => setFormData({ ...formData, claimType: e.target.value })}
              >
                {Object.entries(CLAIM_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Date"
                type="date"
                value={formData.incidentDate}
                error={errors.incidentDate}
                aiFilled={aiFilledFields.has('incidentDate')}
                onChange={(e: any) => setFormData({ ...formData, incidentDate: e.target.value })}
                onBlur={() => handleBlur('incidentDate')}
              />
              <Input
                label="Time"
                type="time"
                value={formData.incidentTime}
                error={errors.incidentTime}
                aiFilled={aiFilledFields.has('incidentTime')}
                onChange={(e: any) => setFormData({ ...formData, incidentTime: e.target.value })}
                onBlur={() => handleBlur('incidentTime')}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-gray-700">Description</label>
                {aiFilledFields.has('description') && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    <Sparkles size={10} /> AI FILLED
                  </span>
                )}
              </div>
              <textarea
                className={cn(
                  'w-full px-3 py-2 rounded-lg border outline-none h-32 resize-none transition-all text-sm',
                  aiFilledFields.has('description')
                    ? 'border-amber-300 bg-amber-50/50 focus:ring-amber-500'
                    : 'border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
                  errors.description ? 'border-red-500 focus:ring-red-100' : ''
                )}
                placeholder="Describe how the incident happened in detail..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                onBlur={() => handleBlur('description')}
              />
              {errors.description && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle size={10} /> {errors.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Location */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Incident Location</h2>
              <p className="text-sm text-gray-500 mt-1">Where did it happen?</p>
            </div>

            <div className="relative" ref={addressContainerRef}>
              <Search
                className="absolute left-3 h-4 w-4 text-gray-400 z-10"
                style={{ top: '1.2rem' }}
              />
              <Input
                placeholder="Search location (e.g. Jalan Tun Razak)"
                value={formData.address}
                error={errors.address}
                className="pl-9"
                onChange={handleAddressSearch}
                onFocus={() => {
                  if (formData.address && formData.address.length > 2) {
                    setShowAddressSuggestions(true);
                  }
                }}
                onBlur={() => handleBlur('address')}
              />
              {showAddressSuggestions && addressSuggestions.length > 0 && (
                <div className="absolute z-20 w-full bg-white mt-1 border border-gray-100 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="bg-gray-50 px-3 py-1.5 text-[10px] uppercase font-bold text-gray-400">
                    Suggestions
                  </div>
                  {addressSuggestions.map(addr => (
                    <button
                      key={addr}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 text-sm flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                      onClick={() => selectAddress(addr)}
                    >
                      <MapPin size={16} className="text-gray-400 shrink-0" />
                      <span className="truncate">{addr}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Google Maps Integration (Embed) */}
            <div
              className="aspect-video bg-gray-100 rounded-xl overflow-hidden border border-gray-200 shadow-inner relative tci-map-container"
              style={{ width: '100%', height: '220px' }}
            >
              {formData.address ? (
                <>
                  {isMapLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 z-10">
                      <Loader2 className="animate-spin text-blue-500 mb-2" size={24} />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        Loading Map...
                      </span>
                    </div>
                  )}
                  <iframe
                    width="100%"
                    height="100%"
                    className="border-0"
                    loading="lazy"
                    allowFullScreen
                    onLoad={() => setIsMapLoading(false)}
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(formData.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                    style={{ filter: 'grayscale(0.2)' }}
                  ></iframe>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <div className="bg-white p-4 rounded-full shadow-sm mb-3">
                    <MapPin size={32} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-medium">Enter location to see map</p>
                </div>
              )}
              {!formData.address && ( // Overlay for demo if map fails to load without key
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50 pointer-events-none">
                  {/* This is just a fallback if iframe breaks due to no API key */}
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-3">
              <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-blue-700">
                Ensure the location pin is accurate. This will be used to deploy the nearest
                adjuster.
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Photos */}
        {step === 5 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Damage Evidence</h2>
              <p className="text-sm text-gray-500 mt-1">Upload at least 2 photos of the damage.</p>
            </div>

            {/* Upload Area */}
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all cursor-pointer group',
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-gray-50/50 hover:border-blue-500 hover:bg-blue-50/50',
                errors.photos ? 'border-red-300 bg-red-50/30' : ''
              )}
              onClick={() => document.getElementById('photo-upload')?.click()}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) {
                  const mockEvent = { target: { files: e.dataTransfer.files } } as any;
                  handlePhotoUpload(mockEvent);
                }
              }}
            >
              <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="text-blue-600" size={20} />
              </div>
              <h3 className="text-sm font-bold text-gray-900">Click or drag to upload photos</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-[200px]">
                Supports JPG, PNG (Max 5MB)
              </p>
              <input
                id="photo-upload"
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
            {errors.photos && (
              <p className="text-xs text-red-500 text-center font-medium">{errors.photos}</p>
            )}

            {/* Photo List */}
            {formData.photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {formData.photos.map((file: File, idx: number) => (
                  <div
                    key={idx}
                    className="relative aspect-square group rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-white cursor-pointer"
                    onClick={() => setPreviewPhotoIndex(idx)}
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt="preview"
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />

                    {/* Top Right Removal Icon */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setPhotoToRemoveIndex(idx);
                      }}
                      className="absolute top-1.5 right-1.5 z-10 bg-white/80 hover:bg-red-500 hover:text-white p-1.5 text-gray-600 rounded-full backdrop-blur-sm transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>

                    {/* <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"> */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 text-white transition-opacity">
                      <p className="text-[9px] truncate px-1">{file.name}</p>
                      <p className="text-[8px] text-gray-300 px-1">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>

                    {/* Removal Confirmation Overlay */}
                    {photoToRemoveIndex === idx && (
                      <div className="absolute inset-0 z-20 bg-white/95 flex flex-col items-center justify-center p-2 text-center animate-in fade-in zoom-in-95 duration-200">
                        <p className="text-[10px] font-bold text-gray-900 mb-2 leading-tight">
                          Remove photo?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              removePhoto(idx);
                              setPhotoToRemoveIndex(null);
                            }}
                            className="bg-red-500 text-white text-[9px] font-bold px-2 py-1 rounded"
                          >
                            Yes
                          </button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setPhotoToRemoveIndex(null);
                            }}
                            className="bg-gray-100 text-gray-600 text-[9px] font-bold px-2 py-1 rounded"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview Modal */}
        {previewPhotoIndex !== null && (
          <div
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setPreviewPhotoIndex(null)}
          >
            <button className="absolute top-6 right-6 text-white hover:text-gray-300 transition-colors">
              <X size={32} />
            </button>
            <img
              src={URL.createObjectURL(formData.photos[previewPhotoIndex])}
              alt="Full Preview"
              className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {/* Step 6: Review */}
        {step === 6 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Review Submission</h2>
              <p className="text-sm text-gray-500 mt-1">
                Please verify all details before submitting.
              </p>
            </div>

            <div className="space-y-4 bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
              <div className="flex justify-between items-center py-1 border-b border-gray-200/50 last:border-0">
                <span className="text-sm text-gray-500">Claimant</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{formData.claimantId || 'Self'}</p>
                  <p className="text-xs text-gray-400">{formData.nric}</p>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-200/50 last:border-0">
                <span className="text-sm text-gray-500">Vehicle</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{formData.vehiclePlate}</p>
                  <p className="text-xs text-gray-400">
                    {formData.vehicleYear} {formData.vehicleMake} {formData.vehicleModel}
                  </p>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-200/50 last:border-0">
                <span className="text-sm text-gray-500">Claim Type</span>
                <div className="text-right">
                  <p className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md">
                    {CLAIM_TYPES[formData.claimType]}
                  </p>
                  <p className="text-xs text-gray-400">
                    <span
                      className="flex items-center gap-1"
                      style={{ justifyContent: 'flex-end', marginRight: 8, marginTop: 4 }}
                    >
                      <ImageIcon size={14} className="text-gray-400" />
                      {formData.photos.length} evidence{formData.photos.length === 1 ? '' : 's'}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-gray-200/50 last:border-0">
                <span className="text-sm text-gray-500">Incident Details</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 max-w-[220px]">
                    {formData.address}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formData.incidentDate} at {formData.incidentTime}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
              <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={20} />
              <p className="text-xs text-blue-800 leading-relaxed">
                By submitting, you confirm that the information provided is accurate and true.
                {mode === 'AGENT'
                  ? ' The claimant will receive an SMS to verify their identity via V-KYC.'
                  : ' You will be asked to verify your identity using your MyKad during the video call.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleBack}>
            {step === (mode === 'AGENT' ? 1 : 2) ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex gap-3">
            {step < 5 && (
              <Button
                variant="outline"
                className="group border-amber-200/60 hover:bg-amber-50 hidden sm:flex"
                onClick={fillDemoData}
                title="Fill with dummy data for testing"
              >
                <Sparkles
                  size={16}
                  className="text-amber-500 group-hover:scale-125 transition-transform"
                />
              </Button>
            )}

            <Button className="min-w-[120px]" onClick={step === 6 ? handleSubmit : handleNext}>
              {step === 6 ? 'Submit Claim' : 'Continue'}
              {step !== 6 && <ChevronRight size={18} />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
