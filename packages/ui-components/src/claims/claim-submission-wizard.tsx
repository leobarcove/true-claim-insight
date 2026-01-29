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
  ChevronDown,
  FileText,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAiExtraction } from '../hooks/use-ai-extraction';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ================= CONSTANTS & DATA =================

const CLAIM_TYPES: Record<string, string> = {
  OWN_DAMAGE: 'Own Damage',
  THIRD_PARTY_PROPERTY: 'Third Party Property Damage',
  THEFT: 'Theft',
  WINDSCREEN: 'Windscreen',
};

const normalizeDate = (dateStr: string) => {
  if (!dateStr) return '';

  const parts = dateStr.split(/[/ .-]/);
  if (parts.length === 3) {
    // Case 1: DD/MM/YYYY
    if (parts[0].length <= 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    // Case 2: YYYY/MM/DD
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }

  // Fallback
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}

  return dateStr;
};

// ================= INTERNAL COMPONENTS =================

const Button = ({ children, className, variant = 'default', ...props }: any) => {
  const variants: any = {
    default:
      'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-95 text-sm',
    outline: 'border border-input bg-background hover:bg-accent text-accent-foreground text-sm',
    ghost: 'hover:bg-accent text-muted-foreground text-sm hover:text-accent-foreground',
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 text-sm',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm',
    danger:
      'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 text-sm',
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
  inputRef,
  ...props
}: any) => (
  <div className={cn('space-y-1.5 relative', containerClassName)}>
    <div className="flex justify-between items-center">
      {label && <label className="text-sm font-medium text-foreground">{label}</label>}
      {aiFilled && (
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">
          <Sparkles size={10} /> AI FILLED
        </span>
      )}
    </div>
    <input
      className={cn(
        'w-full px-3 py-2.5 rounded-lg border text-sm transition-all outline-none bg-background text-foreground placeholder:text-muted-foreground dark:[color-scheme:dark]',
        aiFilled
          ? 'border-amber-500/50 bg-amber-500/5 focus:ring-amber-500'
          : 'border-input focus:ring-2 focus:ring-ring focus:border-primary',
        error ? 'border-destructive focus:border-destructive focus:ring-destructive/30' : '',
        className
      )}
      onBlur={onBlur}
      ref={inputRef}
      {...props}
    />
    {error && (
      <p className="text-xs text-destructive flex items-center gap-1">
        <AlertCircle size={10} /> {error}
      </p>
    )}
  </div>
);

const Select = ({
  label,
  value,
  onChange,
  options,
  error,
  aiFilled,
  className,
  containerClassName,
  ...props
}: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onChange({ target: { value: val } });
    setIsOpen(false);
  };

  const selectedLabel = options.find((o: any) => o.value === value)?.label || value;

  return (
    <div className={cn('space-y-1.5 relative', containerClassName)} ref={containerRef}>
      <div className="flex justify-between items-center">
        {label && <label className="text-sm font-medium text-foreground">{label}</label>}
        {aiFilled && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse">
            <Sparkles size={10} /> AI FILLED
          </span>
        )}
      </div>
      <div
        className={cn(
          'w-full px-3 py-2.5 rounded-lg border text-sm transition-all outline-none bg-background text-foreground flex items-center justify-between cursor-pointer',
          aiFilled
            ? 'border-amber-500/50 bg-amber-500/5 focus:ring-amber-500'
            : 'border-input hover:border-primary/50',
          error ? 'border-destructive focus:border-destructive focus:ring-destructive/30' : '',
          isOpen ? 'ring-2 ring-ring border-primary' : '',
          className
        )}
        onClick={() => setIsOpen(!isOpen)}
        {...props}
      >
        <span className={!value ? 'text-muted-foreground' : ''}>
          {selectedLabel || 'Select...'}
        </span>
        <ChevronDown
          size={16}
          className={cn('text-muted-foreground transition-transform', isOpen && 'rotate-180')}
        />
      </div>

      {isOpen && (
        <div className="absolute z-20 w-full bg-popover mt-1 border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
          {options.map((opt: any) => (
            <div
              key={opt.value}
              className={cn(
                'px-4 py-2 cursor-pointer text-sm flex justify-between items-center transition-colors',
                value === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
              {value === opt.value && <Check size={14} className="text-primary-foreground" />}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  );
};

const AutocompleteInput = ({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder,
  error,
  aiFilled,
  onBlur,
}: any) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    onChange(e.target.value);
    setShowSuggestions(true);
  };

  const handleFocus = () => {
    setShowSuggestions(true);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setShowSuggestions(false);
    // Increased timeout slightly to ensure state propagation before blur validation
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.blur();
      }
    }, 50);
  };

  // Compute filtered suggestions during render to stay in sync with props
  const filtered = suggestions.filter((s: string) =>
    s.toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div className="relative" ref={containerRef}>
      <Input
        label={label}
        value={value}
        onChange={handleInput}
        placeholder={placeholder}
        error={error}
        aiFilled={aiFilled}
        onFocus={handleFocus}
        onBlur={onBlur}
        inputRef={inputRef}
      />
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-50 w-full bg-popover mt-1 border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((item: string) => (
            <div
              key={item}
              className="px-4 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm text-foreground"
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(item);
              }}
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

// Module-level cache to persist data across component remounts and prevent redundant fetches
let vehicleDataCache: Record<string, string[]> | null = null;
let vehicleDataPromise: Promise<Record<string, string[]>> | null = null;

export function ClaimSubmissionWizard({ mode, onSuccess, onCancel }: ClaimSubmissionWizardProps) {
  // Step 0 is the Selection Screen (AI vs Manual)
  const [step, setStep] = useState(() => {
    const initialStep = mode === 'AGENT' ? 0 : 2;
    return initialStep;
  });

  // Initialize from cache if available to prevent flickering
  const [vehicleData, setVehicleData] = useState<Record<string, string[]>>(vehicleDataCache || {});

  useEffect(() => {
    // If we already have the data, no need to fetch again
    if (vehicleDataCache) {
      if (Object.keys(vehicleData).length === 0) {
        setVehicleData(vehicleDataCache);
      }
      return;
    }

    const fetchVehicleData = async () => {
      // If a fetch is already in progress, wait for it
      if (vehicleDataPromise) {
        const data = await vehicleDataPromise;
        setVehicleData(data);
        return;
      }

      // Start new fetch
      vehicleDataPromise = (async () => {
        try {
          const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';
          const res = await fetch(`${baseUrl}/master-data/vehicles/structure`);
          if (res.ok) {
            const { data } = await res.json();
            vehicleDataCache = data;
            return data;
          }
        } catch (e) {
          console.error('Failed to fetch vehicle data', e);
        }
        return {};
      })();

      const result = await vehicleDataPromise;
      setVehicleData(result);
    };

    fetchVehicleData();
  }, []);

  // Document input refs
  const policyDocInputRef = useRef<HTMLInputElement>(null);
  const policeDocInputRef = useRef<HTMLInputElement>(null);
  const myKadDocInputRef = useRef<HTMLInputElement>(null);
  const vehicleRegDocInputRef = useRef<HTMLInputElement>(null);
  const workshopQuotationInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
    latitude: '',
    longitude: '',
    photos: [] as File[],
    panelWorkshop: '',
    chassisNo: '',
    engineNo: '',
    notes: '',
    policeReportNumber: '',
    policeReportDate: new Date().toISOString().split('T')[0],
    policeStation: '',
    policyNumber: '',
    policyDocument: null as File | null,
    policeReportDocument: null as File | null,
    myKadFront: null as File | null,
    vehicleRegistrationCard: null as File | null,
    workshopQuotation: null as File | null,
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
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [policeStationSuggestions, setPoliceStationSuggestions] = useState<string[]>([]);
  const [policeStationShowSuggestions, setPoliceStationShowSuggestions] = useState(false);
  const addressContainerRef = useRef<HTMLDivElement>(null);
  const policeStationContainerRef = useRef<HTMLDivElement>(null);

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
      if (
        policeStationContainerRef.current &&
        !policeStationContainerRef.current.contains(event.target as Node)
      ) {
        setPoliceStationShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Stepper labels
  const stepStates = [
    { title: 'Claimant', icon: User, show: mode === 'AGENT' },
    { title: 'Vehicle', icon: Car, show: true },
    { title: 'Incident', icon: MapPin, show: true },
    { title: 'Report', icon: FileText, show: true },
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
      case 'policyNumber':
        if (!value?.trim()) error = 'Policy number is required';
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
      case 'chassisNo':
        if (!value?.trim()) error = 'Chassis number is required';
        break;
      case 'engineNo':
        if (!value?.trim()) error = 'Engine number is required';
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
      else if (!/^\d{6}-\d{2}-\d{4}$/.test(formData.nric) && !/^\d{12}$/.test(formData.nric))
        newErrors.nric = 'Invalid NRIC format (e.g. 880101-12-1234)';

      if (!formData.mobileNumber.trim()) newErrors.mobileNumber = 'Mobile number is required';
      if (!formData.policyNumber.trim()) newErrors.policyNumber = 'Policy number is required';
      if (!formData.policyDocument) newErrors.policyDocument = 'Policy document is required';
      if (!formData.myKadFront) newErrors.myKadFront = 'MyKad Front is required';
    }

    if (currentStep === 2) {
      // Vehicle
      if (!formData.vehiclePlate.trim()) newErrors.vehiclePlate = 'Plate number is required';
      if (!formData.vehicleMake.trim()) newErrors.vehicleMake = 'Make is required';
      if (!formData.vehicleModel.trim()) newErrors.vehicleModel = 'Model is required';
      if (!formData.chassisNo.trim()) newErrors.chassisNo = 'Chassis number is required';
      if (!formData.engineNo.trim()) newErrors.engineNo = 'Engine number is required';
      if (!formData.vehicleRegistrationCard)
        newErrors.vehicleRegistrationCard = 'Vehicle registration card is required';
    }

    if (currentStep === 3) {
      // Incident
      if (!formData.incidentDate) newErrors.incidentDate = 'Date is required';
      if (!formData.incidentTime) newErrors.incidentTime = 'Time is required';
      if (!formData.address.trim()) newErrors.address = 'Location is required';
    }

    if (currentStep === 4) {
      // Report (Description + Police)
      if (!formData.description.trim()) newErrors.description = 'Description is required';
      else if (formData.description.length < 20)
        newErrors.description = 'Please provide more detail (min 20 chars)';
      if (!formData.policeReportDocument)
        newErrors.policeReportDocument = 'Police report is required';
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
    if (aiImportFiles.mykad) {
      newFormData.myKadFront = aiImportFiles.mykad;
    }
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
        newFormData.incidentDate = normalizeDate(data.incident_date);
        filled.add('incidentDate');
      }
      if (data.incident_time) {
        newFormData.incidentTime = data.incident_time;
        filled.add('incidentTime');
      }
    }

    // Process Police Report
    if (aiImportFiles.police_report) {
      newFormData.policeReportDocument = aiImportFiles.police_report;
    }
    if (extraction.police_report?.document) {
      const data = extraction.police_report.document;
      if (data.report?.incident?.narrative) {
        newFormData.description = data.report.incident.narrative;
        filled.add('description');
      }
      if (data.report?.incident?.incident_date && !newFormData.incidentDate) {
        newFormData.incidentDate = normalizeDate(data.report.incident.incident_date);
        filled.add('incidentDate');
      }
      if (data.report?.incident?.incident_time && !newFormData.incidentTime) {
        newFormData.incidentTime = data.report.incident.incident_time;
        filled.add('incidentTime');
      }
      if (data.report?.report_number) {
        newFormData.policeReportNumber = data.report.report_number;
        filled.add('policeReportNumber');
      }
      if (data.report?.report_station) {
        newFormData.policeStation = data.report.report_station;
        filled.add('policeStation');
      }
      if (data.report?.report_date) {
        newFormData.policeReportDate = normalizeDate(data.report.report_date);
        filled.add('policeReportDate');
      }
    }

    setFormData(newFormData);
    setAiFilledFields(filled);
    setErrors({});
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsAiImportActive(false);
    setStep(mode === 'AGENT' ? 1 : 2);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newPhotos = Array.from(e.target.files);
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB

      const validPhotos: File[] = [];
      let hasError = false;

      newPhotos.forEach(f => {
        if (f.type.startsWith('image/') && f.size <= MAX_SIZE) {
          validPhotos.push(f);
        } else {
          hasError = true;
        }
      });

      if (hasError) {
        setErrors(prev => ({
          ...prev,
          photos: 'Some files were rejected. Images only, max 5MB each.',
        }));
      } else if (validPhotos.length > 0) {
        // Clear error if adding valid photos
        setErrors(prev => {
          const next = { ...prev };
          delete next.photos;
          return next;
        });
      }

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
    }
    // Reset input
    if (e.target) e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setFormData((prev: any) => ({
      ...prev,
      photos: prev.photos.filter((_: any, i: number) => i !== index),
    }));
  };

  const handleDocumentUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field:
      | 'policyDocument'
      | 'policeReportDocument'
      | 'myKadFront'
      | 'vehicleRegistrationCard'
      | 'workshopQuotation'
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      if (file.size > 5 * 1024 * 1024) {
        setErrors(prev => ({ ...prev, [field]: 'File size exceeds 5MB' }));
        return;
      }

      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        setErrors(prev => ({
          ...prev,
          [field]: 'Invalid file format. Only PDF and images are allowed.',
        }));
        return;
      }

      setFormData((prev: any) => ({ ...prev, [field]: file }));
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const removeDocument = (
    field:
      | 'policyDocument'
      | 'policeReportDocument'
      | 'myKadFront'
      | 'vehicleRegistrationCard'
      | 'workshopQuotation'
  ) => {
    setFormData((prev: any) => ({ ...prev, [field]: null }));
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
            setAddressSuggestions(json.data || []);
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

  const selectAddress = (item: any) => {
    setFormData({
      ...formData,
      address: item.displayName,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    });
    setShowAddressSuggestions(false);
    setErrors(e => {
      const next = { ...e };
      delete next.address;
      return next;
    });
  };

  const handlePoliceStationSearch = async (query: string) => {
    try {
      const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';
      const res = await fetch(`${baseUrl}/location/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const json = await res.json();
        const suggestions = (json.data || []).map((item: any) => item.displayName);
        setPoliceStationSuggestions(suggestions);
      }
    } catch (e) {
      console.error('Failed to fetch police station suggestions', e);
    }
  };

  const fillDemoData = async () => {
    const fetchFile = async (fileName: string, type: string) => {
      try {
        const response = await fetch(`/demo-assets/${fileName}`);
        const blob = await response.blob();
        return new File([blob], fileName, { type });
      } catch (e) {
        console.error('Failed to fetch demo file', fileName, e);
        return null;
      }
    };

    const [nric, policy, voc, police, photo1, photo2, quotation] = await Promise.all([
      fetchFile('nric.jpg', 'image/jpeg'),
      fetchFile('insurance_document.jpg', 'image/jpeg'),
      fetchFile('voc.jpg', 'image/jpeg'),
      fetchFile('police_report.jpg', 'image/jpeg'),
      fetchFile('damaged_vehicle_1.jpg', 'image/jpeg'),
      fetchFile('damaged_vehicle_2.jpg', 'image/jpeg'),
      fetchFile('workshop_repair_2.jpg', 'image/jpeg'),
    ]);

    setFormData({
      ...formData,
      claimantId: 'Kumar Claimant',
      nric: '850512-14-5567',
      mobileNumber: '+60123456789',
      policyNumber: 'POL-2026-991234',
      vehiclePlate: 'WQX 9988',
      vehicleMake: 'Proton',
      vehicleModel: 'X50',
      vehicleYear: '2025',
      claimType: 'OWN_DAMAGE',
      description:
        'The vehicle was hit from the rear by a motorcycle while waiting at a traffic light in Kuala Lumpur.',
      address: 'Jalan Bukit Bintang, Kuala Lumpur, Malaysia',
      chassisNo: 'MH4RT1234LK567890',
      engineNo: '1NZFE987654',
      policeReportNumber: `IPDKL/${Math.floor(Math.random() * 90000) + 10000}/${new Date().getFullYear()}`,
      policeReportDate: new Date().toISOString().split('T')[0],
      policeStation: 'Balai Polis Jalan Tun Razak',
      myKadFront: nric,
      policyDocument: policy,
      vehicleRegistrationCard: voc,
      policeReportDocument: police,
      workshopQuotation: quotation,
      photos: [photo1, photo2].filter(Boolean) as File[],
    });
    setAiFilledFields(new Set());
    setErrors({});
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
      <div className="max-w-2xl mx-auto space-y-8 py-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">How would you like to start?</h2>
          <p className="text-muted-foreground">Choose how you want to input the claim details</p>
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
                      : 'border-border hover:border-primary/50 hover:bg-muted/50/50'
                  )}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*,.pdf';
                    input.onchange = (e: any) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          setAiExtractionError('File size exceeds 5MB');
                          return;
                        }
                        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                          setAiExtractionError('Invalid file type. Only PDF and Image allowed.');
                          return;
                        }
                        setAiExtractionError(null);
                        setAiImportFiles(prev => ({ ...prev, [slot.id]: file }));
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
                        : 'bg-muted text-muted-foreground/80'
                    )}
                  >
                    {aiImportFiles[slot.id] ? <Check size={20} /> : <slot.icon size={20} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-foreground">{slot.label}</h4>
                      {slot.required && (
                        <span className="text-[10px] text-red-500 font-bold uppercase">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {aiImportFiles[slot.id] ? aiImportFiles[slot.id]?.name : slot.description}
                    </p>
                  </div>
                  {aiImportFiles[slot.id] && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setAiImportFiles(prev => ({ ...prev, [slot.id]: null }));
                      }}
                      className="p-1 hover:bg-red-100 rounded-full text-muted-foreground/80 hover:text-red-500 transition-colors"
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
                className="min-w-[160px] shadow-lg shadow-primary/20"
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
              className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all group shadow-sm hover:shadow-md"
            >
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <User className="text-muted-foreground group-hover:text-primary" size={32} />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-lg text-foreground">Manual Entry</h3>
                <p className="text-sm text-muted-foreground mt-1">Fill in details step-by-step</p>
              </div>
            </button>

            <button
              onClick={() => setIsAiImportActive(true)}
              className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-all group relative overflow-hidden shadow-sm hover:shadow-md"
            >
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center group-hover:scale-110 transition-transform shadow-primary/20 shadow-lg">
                <Sparkles className="text-primary-foreground" size={28} />
              </div>
              <div className="text-center">
                <h3 className="font-bold text-lg text-foreground">AI Import</h3>
                <p className="text-sm text-muted-foreground mt-1">Upload Documents</p>
              </div>
              <div className="mt-4 px-3 py-1 bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wide rounded-full">
                Recommended
              </div>
            </button>
          </div>
        )}

        <div className="flex justify-center">
          <button
            onClick={fillDemoData}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600 text-xs font-bold hover:bg-amber-500/20 transition-colors shadow-sm"
          >
            <Sparkles size={14} />
            FILL DEMO DATA (SHORTCUT)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-card rounded-2xl shadow-sm border border-border flex flex-col min-h-[600px]">
      {/* Progress Header */}
      <div className="bg-card px-6 py-4 border-b border-border">
        <div className="flex justify-between items-center relative">
          {/* Connecting Line */}
          <div className="absolute top-4 left-0 w-full h-0.5 bg-muted -z-0 translate-y-[-50%] overflow-hidden">
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
                className="relative z-10 flex flex-col items-center gap-2 bg-card px-2"
              >
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
                    isActive
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110'
                      : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground border border-border'
                  )}
                >
                  {isCompleted ? <Check size={14} strokeWidth={3} /> : <StepIcon size={14} />}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider transition-colors',
                    isActive
                      ? 'text-primary'
                      : isCompleted
                        ? 'text-green-600'
                        : 'text-muted-foreground/50'
                  )}
                >
                  {s.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-8 flex-1 flex flex-col" style={{ minHeight: '600px' }}>
        {/* Step 1: Claimant */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-foreground">Claimant Details</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter claimant details and policy information.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Name (as per MyKad)"
                  placeholder="e.g. Kumar Claimant"
                  value={formData.claimantId}
                  error={errors.claimantId}
                  aiFilled={aiFilledFields.has('claimantId')}
                  onChange={(e: any) => setFormData({ ...formData, claimantId: e.target.value })}
                  onBlur={() => handleBlur('claimantId')}
                />
                <Input
                  label="NRIC Number"
                  placeholder="e.g. 880101-14-1234"
                  value={formData.nric}
                  error={errors.nric}
                  aiFilled={aiFilledFields.has('nric')}
                  onChange={(e: any) => setFormData({ ...formData, nric: e.target.value })}
                  onBlur={() => handleBlur('nric')}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Mobile Number"
                  placeholder="e.g.+60123456789"
                  value={formData.mobileNumber}
                  error={errors.mobileNumber}
                  aiFilled={aiFilledFields.has('mobileNumber')}
                  onChange={(e: any) => setFormData({ ...formData, mobileNumber: e.target.value })}
                  onBlur={() => handleBlur('mobileNumber')}
                />
                <Input
                  label="Policy Number"
                  placeholder="e.g. POL-2025-001234"
                  value={formData.policyNumber}
                  error={errors.policyNumber}
                  onChange={(e: any) => setFormData({ ...formData, policyNumber: e.target.value })}
                  onBlur={() => handleBlur('policyNumber')}
                />
              </div>

              {/* Document Uploads */}
              <div
                className="space-y-1.5 pt-4 border-t border-border"
                style={{ marginTop: '1.5rem' }}
              >
                <label className="text-sm font-medium text-foreground">
                  MyKad (Front) <span className="text-destructive">*</span>
                </label>
                <div
                  className={cn(
                    'border border-dashed rounded-lg p-3 flex items-center justify-between transition-colors bg-muted/20 hover:bg-muted/40',
                    formData.myKadFront ? 'border-primary/50 bg-primary/5' : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                      <User size={18} />
                    </div>
                    {formData.myKadFront ? (
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{formData.myKadFront.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(formData.myKadFront.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p>Upload MyKad (Front) Image</p>
                      </div>
                    )}
                  </div>
                  {formData.myKadFront ? (
                    <button
                      onClick={() => removeDocument('myKadFront')}
                      className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => myKadDocInputRef.current?.click()}
                    >
                      Browse
                    </Button>
                  )}
                  <input
                    ref={myKadDocInputRef}
                    id="mykad-doc-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleDocumentUpload(e, 'myKadFront')}
                  />
                </div>
                {errors.myKadFront && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} /> {errors.myKadFront}
                  </p>
                )}
              </div>

              {/* Policy Document Upload */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Policy Document <span className="text-destructive">*</span>
                </label>
                <div
                  className={cn(
                    'border border-dashed rounded-lg p-3 flex items-center justify-between transition-colors bg-muted/20 hover:bg-muted/40',
                    formData.policyDocument ? 'border-primary/50 bg-primary/5' : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                      <FileText size={18} />
                    </div>
                    {formData.policyDocument ? (
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {formData.policyDocument.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(formData.policyDocument.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p>Upload Policy PDF / Image</p>
                      </div>
                    )}
                  </div>
                  {formData.policyDocument ? (
                    <button
                      onClick={() => removeDocument('policyDocument')}
                      className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => policyDocInputRef.current?.click()}
                    >
                      Browse
                    </Button>
                  )}
                  <input
                    ref={policyDocInputRef}
                    id="policy-doc-upload"
                    type="file"
                    accept=".pdf, image/*"
                    className="hidden"
                    onChange={e => handleDocumentUpload(e, 'policyDocument')}
                  />
                </div>
                {errors.policyDocument && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} /> {errors.policyDocument}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Vehicle */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-foreground">Vehicle Details</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Vehicle involved in the incident.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Plate Number"
                placeholder="e.g. ABC 1234"
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
                placeholder="e.g. 2026"
                value={formData.vehicleYear}
                onChange={(e: any) => setFormData({ ...formData, vehicleYear: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <AutocompleteInput
                label="Make"
                placeholder="Select Make"
                value={formData.vehicleMake}
                suggestions={Object.keys(vehicleData)}
                error={errors.vehicleMake}
                aiFilled={aiFilledFields.has('vehicleMake')}
                onChange={(val: string) => {
                  setFormData({ ...formData, vehicleMake: val, vehicleModel: '' });
                  if (val) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.vehicleMake;
                      return next;
                    });
                  }
                }}
                onBlur={() => handleBlur('vehicleMake')}
              />
              <AutocompleteInput
                label="Model"
                placeholder="Select Model"
                value={formData.vehicleModel}
                suggestions={vehicleData[formData.vehicleMake] || []}
                error={errors.vehicleModel}
                aiFilled={aiFilledFields.has('vehicleModel')}
                onChange={(val: string) => {
                  setFormData({ ...formData, vehicleModel: val });
                  if (val) {
                    setErrors(prev => {
                      const next = { ...prev };
                      delete next.vehicleModel;
                      return next;
                    });
                  }
                }}
                onBlur={() => handleBlur('vehicleModel')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Chassis Number"
                placeholder="e.g. MH4RT1234LK567890"
                value={formData.chassisNo}
                error={errors.chassisNo}
                onChange={(e: any) =>
                  setFormData({ ...formData, chassisNo: e.target.value.toUpperCase() })
                }
                onBlur={() => handleBlur('chassisNo')}
              />
              <Input
                label="Engine Number"
                placeholder="e.g. 1NZFE987654"
                value={formData.engineNo}
                error={errors.engineNo}
                onChange={(e: any) =>
                  setFormData({ ...formData, engineNo: e.target.value.toUpperCase() })
                }
                onBlur={() => handleBlur('engineNo')}
              />
            </div>

            {/* Vehicle Registration Card Upload - Mandatory */}
            <div
              className="space-y-1.5 pt-4 border-t border-border"
              style={{ marginTop: '1.5rem' }}
            >
              <label className="text-sm font-medium text-foreground">
                Vehicle Registration Card <span className="text-destructive">*</span>
              </label>
              <div
                className={cn(
                  'border border-dashed rounded-lg p-3 flex items-center justify-between transition-colors bg-muted/20 hover:bg-muted/40',
                  formData.vehicleRegistrationCard
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border'
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                    <FileText size={18} />
                  </div>
                  {formData.vehicleRegistrationCard ? (
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {formData.vehicleRegistrationCard.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(formData.vehicleRegistrationCard.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p>Upload Registration Card PDF / Image</p>
                    </div>
                  )}
                </div>
                {formData.vehicleRegistrationCard ? (
                  <button
                    onClick={() => removeDocument('vehicleRegistrationCard')}
                    className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => vehicleRegDocInputRef.current?.click()}
                  >
                    Browse
                  </Button>
                )}
                <input
                  ref={vehicleRegDocInputRef}
                  id="vehicle-reg-doc-upload"
                  type="file"
                  accept=".pdf, image/*"
                  className="hidden"
                  onChange={e => handleDocumentUpload(e, 'vehicleRegistrationCard')}
                />
              </div>
              {errors.vehicleRegistrationCard && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle size={10} /> {errors.vehicleRegistrationCard}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Incident */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-foreground">Incident</h2>
              <p className="text-sm text-muted-foreground mt-1">Where and when did it happen?</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-sm font-medium text-foreground">Location</label>
                <div className="group relative flex items-center mt-1">
                  <AlertCircle
                    size={14}
                    className="text-muted-foreground/70 hover:text-primary cursor-help transition-colors"
                  />
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-64 p-3 backdrop-blur-md border border-primary/20 text-primary-foreground text-xs rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                    <p className="text-muted-foreground leading-relaxed">
                      Ensure the location pin is accurate. This will be used to deploy the nearest
                      adjuster.
                    </p>
                  </div>
                </div>
              </div>
              <div className="relative" ref={addressContainerRef}>
                <Search
                  className="absolute left-3 h-4 w-4 text-muted-foreground/80 z-10"
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
                  <div className="absolute z-20 w-full bg-background mt-1 border border-border/50 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="bg-muted/50 px-3 py-1.5 text-[10px] uppercase font-bold text-muted-foreground/80">
                      Suggestions
                    </div>
                    {addressSuggestions.map((item: any) => (
                      <button
                        key={item.displayName}
                        className="w-full text-left px-4 py-3 hover:bg-primary/10 text-sm flex items-center gap-3 transition-colors border-b border-border last:border-0"
                        onClick={() => selectAddress(item)}
                      >
                        <MapPin size={16} className="text-muted-foreground/80 shrink-0" />
                        <span className="truncate">{item.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Google Maps Integration (Embed) */}
              <div
                className="aspect-video bg-muted rounded-xl overflow-hidden border border-border shadow-inner relative tci-map-container mt-4"
                style={{ width: '100%', height: '180px' }}
              >
                {formData.address ? (
                  <>
                    {isMapLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
                        <Loader2 className="animate-spin text-primary mb-2" size={24} />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          Loading Map...
                        </span>
                      </div>
                    )}
                    <iframe
                      width="100%"
                      height="100%"
                      className="border-0"
                      allowFullScreen
                      onLoad={() => setIsMapLoading(false)}
                      src={`https://maps.google.com/maps?q=${encodeURIComponent(formData.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                      style={{ filter: 'grayscale(0.2)' }}
                    ></iframe>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/80">
                    <div className="bg-background p-4 rounded-full shadow-sm mb-3">
                      <MapPin size={32} className="text-muted-foreground/60" />
                    </div>
                    <p className="text-sm font-medium">Enter location to see map</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Select
                label="Claim Type"
                value={formData.claimType}
                onChange={(e: any) => setFormData({ ...formData, claimType: e.target.value })}
                options={Object.entries(CLAIM_TYPES).map(([key, label]) => ({
                  value: key,
                  label,
                }))}
              />
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
          </div>
        )}

        {/* Step 4: Description & Reports */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-foreground">Report</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Describe the incident and attach reports.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-foreground">Description</label>
                {aiFilledFields.has('description') && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    <Sparkles size={10} /> AI FILLED
                  </span>
                )}
              </div>
              <textarea
                className={cn(
                  'w-full px-3 py-2 rounded-lg border outline-none h-24 resize-none transition-all text-sm bg-background text-foreground placeholder:text-muted-foreground',
                  aiFilledFields.has('description')
                    ? 'border-amber-500/50 bg-amber-500/5 focus:ring-amber-500'
                    : 'border-input focus:ring-2 focus:ring-ring focus:border-primary',
                  errors.description ? 'border-destructive focus:ring-destructive/30' : ''
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

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Report Number"
                placeholder="e.g. IPDKL/10234/2025"
                value={formData.policeReportNumber}
                aiFilled={aiFilledFields.has('policeReportNumber')}
                onChange={(e: any) =>
                  setFormData({ ...formData, policeReportNumber: e.target.value.toUpperCase() })
                }
                onBlur={() => handleBlur('policeReportNumber')}
              />
              <Input
                label="Date"
                type="date"
                value={formData.policeReportDate}
                aiFilled={aiFilledFields.has('policeReportDate')}
                onChange={(e: any) =>
                  setFormData({ ...formData, policeReportDate: e.target.value })
                }
                onBlur={() => handleBlur('policeReportDate')}
              />
            </div>
            <div className="relative" ref={policeStationContainerRef}>
              <Input
                label="Station"
                placeholder="e.g. Balai Polis Jalan Tun Razak"
                value={formData.policeStation}
                aiFilled={aiFilledFields.has('policeStation')}
                onChange={(e: any) => {
                  const val = e.target.value;
                  setFormData({ ...formData, policeStation: val });
                  if (val.length > 2) {
                    setPoliceStationShowSuggestions(true);
                    handlePoliceStationSearch(val);
                  } else {
                    setPoliceStationShowSuggestions(false);
                  }
                }}
                onFocus={() => {
                  if (formData.policeStation && formData.policeStation.length > 2) {
                    setPoliceStationShowSuggestions(true);
                  }
                }}
                onBlur={() => handleBlur('policeStation')}
              />
              {policeStationShowSuggestions && policeStationSuggestions.length > 0 && (
                <div className="absolute z-20 w-full bg-background mt-1 border border-border/50 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  {policeStationSuggestions.map(addr => (
                    <button
                      key={addr}
                      className="w-full text-left px-4 py-3 hover:bg-primary/10 text-sm flex items-center gap-3 transition-colors border-b border-border last:border-0"
                      onClick={() => {
                        setFormData({ ...formData, policeStation: addr });
                        setPoliceStationShowSuggestions(false);
                      }}
                    >
                      <MapPin size={14} className="text-muted-foreground/80 shrink-0" />
                      <span className="truncate">{addr}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <label className="text-sm font-medium text-foreground">
                Police Report <span className="text-destructive">*</span>
              </label>

              {/* Police Report Document Upload */}
              <div className="space-y-1.5" style={{ marginTop: 6 }}>
                <div
                  className={cn(
                    'border border-dashed rounded-lg p-3 flex items-center justify-between transition-colors bg-muted/20 hover:bg-muted/40',
                    formData.policeReportDocument
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                      <FileText size={18} />
                    </div>
                    {formData.policeReportDocument ? (
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {formData.policeReportDocument.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(formData.policeReportDocument.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p>Upload Police Report PDF / Image</p>
                      </div>
                    )}
                  </div>
                  {formData.policeReportDocument ? (
                    <button
                      onClick={() => removeDocument('policeReportDocument')}
                      className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                    >
                      <X size={16} />
                    </button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => policeDocInputRef.current?.click()}
                    >
                      Browse
                    </Button>
                  )}
                  <input
                    ref={policeDocInputRef}
                    id="police-doc-upload"
                    type="file"
                    accept=".pdf, image/*"
                    className="hidden"
                    onChange={e => handleDocumentUpload(e, 'policeReportDocument')}
                  />
                </div>
                {errors.policeReportDocument && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} /> {errors.policeReportDocument}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Photos */}
        {step === 5 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-xl font-bold text-foreground">Damage Evidence</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload at least 2 photos of the damage.
              </p>
            </div>

            {/* Upload Area */}
            <div
              className={cn(
                'border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer group',
                isDragging
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-muted/30 hover:border-primary hover:bg-primary/5',
                errors.photos ? 'border-destructive/50 bg-destructive/10' : ''
              )}
              onClick={() => photoInputRef.current?.click()}
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
              <div className="w-12 h-12 bg-card rounded-full shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="text-primary" size={20} />
              </div>
              <h3 className="text-sm font-bold text-foreground">Click or drag to upload photos</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                Supports JPG, PNG (Max 5MB)
              </p>
              <input
                ref={photoInputRef}
                id="photo-upload"
                type="file"
                multiple
                accept="image/*,.pdf"
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
                    className="relative aspect-square group rounded-lg overflow-hidden border border-border shadow-sm bg-background cursor-pointer"
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
                      className="absolute top-1.5 right-1.5 z-10 bg-background/80 hover:bg-red-500 hover:text-white p-1.5 text-muted-foreground rounded-full backdrop-blur-sm transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    >
                      <X size={12} strokeWidth={3} />
                    </button>

                    {/* <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"> */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 text-white transition-opacity">
                      <p className="text-[9px] truncate px-1">{file.name}</p>
                      <p className="text-[8px] text-muted-foreground/60 px-1">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>

                    {/* Removal Confirmation Overlay */}
                    {photoToRemoveIndex === idx && (
                      <div className="absolute inset-0 z-20 bg-background/95 flex flex-col items-center justify-center p-2 text-center animate-in fade-in zoom-in-95 duration-200">
                        <p className="text-[10px] font-bold text-foreground mb-2 leading-tight">
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
                            className="bg-muted text-muted-foreground text-[9px] font-bold px-2 py-1 rounded"
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

            {/* Workshop Repair Quotation - Optional */}
            <div className="space-y-1.5 pt-6 border-t border-border mt-6">
              <label className="text-sm font-medium text-foreground">
                Workshop Repair Quotation{' '}
                <span className="text-muted-foreground text-xs font-normal">(Optional)</span>
              </label>
              <div
                className={cn(
                  'border border-dashed rounded-lg p-3 flex items-center justify-between transition-colors bg-muted/20 hover:bg-muted/40',
                  formData.workshopQuotation ? 'border-primary/50 bg-primary/5' : 'border-border'
                )}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                    <FileText size={18} />
                  </div>
                  {formData.workshopQuotation ? (
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {formData.workshopQuotation.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(formData.workshopQuotation.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      <p>Upload Workshop Quotation PDF / Image</p>
                    </div>
                  )}
                </div>
                {formData.workshopQuotation ? (
                  <button
                    onClick={() => removeDocument('workshopQuotation')}
                    className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-full transition-colors"
                  >
                    <X size={16} />
                  </button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary hover:text-primary-foreground transition-colors"
                    onClick={() => workshopQuotationInputRef.current?.click()}
                  >
                    Browse
                  </Button>
                )}
                <input
                  ref={workshopQuotationInputRef}
                  id="workshop-quotation-upload"
                  type="file"
                  accept=".pdf, image/*"
                  className="hidden"
                  onChange={e => handleDocumentUpload(e, 'workshopQuotation')}
                />
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewPhotoIndex !== null && (
          <div
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setPreviewPhotoIndex(null)}
          >
            <button className="absolute top-6 right-6 text-white hover:text-muted-foreground/60 transition-colors">
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
              <h2 className="text-xl font-bold text-foreground">Review Submission</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Please verify all details before submitting.
              </p>
            </div>

            <div className="space-y-4 bg-muted/40 p-4 rounded-2xl border border-border">
              <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  Claimant
                  {(formData.myKadFront || formData.policyDocument) && (
                    <FileText size={14} className="text-primary/80" />
                  )}
                </span>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">
                    {formData.claimantId || 'Self'}
                  </p>
                  <p className="text-xs text-muted-foreground">{formData.nric}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Policy: {formData.policyNumber}
                  </p>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  Vehicle
                  {formData.vehicleRegistrationCard && (
                    <FileText size={14} className="text-primary/80" />
                  )}
                </span>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{formData.vehiclePlate}</p>
                  <p className="text-xs text-muted-foreground">
                    {formData.vehicleYear} {formData.vehicleMake} {formData.vehicleModel}
                  </p>
                  {formData.engineNo && (
                    <p className="text-[10px] text-muted-foreground">Engine: {formData.engineNo}</p>
                  )}
                  {formData.chassisNo && (
                    <p className="text-[10px] text-muted-foreground">
                      Chassis: {formData.chassisNo}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  Claim Type
                  {formData.workshopQuotation && <FileText size={14} className="text-primary/80" />}
                </span>
                <div className="text-right">
                  <p className="text-sm font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                    {CLAIM_TYPES[formData.claimType]}
                  </p>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span
                      className="flex items-center gap-1"
                      style={{ justifyContent: 'flex-end', marginRight: 0 }}
                    >
                      <ImageIcon size={14} className="text-muted-foreground" />
                      {formData.photos.length} evidence{formData.photos.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                <span className="text-sm text-muted-foreground">Incident Details</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground max-w-[220px]">
                    {formData.address}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formData.incidentDate} at {formData.incidentTime}
                  </p>
                </div>
              </div>
              {formData.policeReportNumber && (
                <div className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    Police Report
                    {formData.policeReportDocument && (
                      <FileText size={14} className="text-primary/80" />
                    )}
                  </span>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground max-w-[220px]">
                      {formData.policeReportNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">{formData.policeStation}</p>
                    <p className="text-xs text-muted-foreground">{formData.policeReportDate}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 flex gap-3">
              <AlertCircle className="text-primary shrink-0 mt-0.5" size={20} />
              <p className="text-xs text-primary/80 leading-relaxed">
                By submitting, you confirm that the information provided is accurate and true.
                {mode === 'AGENT'
                  ? ' The claimant will receive an SMS to verify their identity via e-KYC.'
                  : ' You will be asked to verify your identity using your MyKad during the video call.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-6 border-t border-border bg-muted/40">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleBack}>
            {step === (mode === 'AGENT' ? 1 : 2) ? 'Cancel' : 'Back'}
          </Button>

          <div className="flex gap-3">
            {step < 6 && (
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
