import { useState } from 'react';

export interface ExtractedData {
  nric?: string;
  claimantName?: string;
  mobileNumber?: string;
  vehiclePlate?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  incidentDate?: string;
  incidentTime?: string;
  description?: string;
  confidence: Record<string, number>;
}

export function useAiExtraction() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extractData = async (files: File[]): Promise<ExtractedData> => {
    setIsExtracting(true);
    
    // Simulate API delay dependent on file count
    await new Promise(resolve => setTimeout(resolve, 2000 * files.length));
    
    setIsExtracting(false);

    // Mock intelligent merging:
    // In a real scenario, we'd classify each document (MyKad, Police Report) 
    // and extract relevant fields from the best source.
    
    // Base data
    let mergedData: ExtractedData = {
      confidence: {
        nric: 0.98,
        claimantName: 0.95,
        vehiclePlate: 0.99,
        incidentDate: 0.75,
        description: 0.85
      }
    };

    // Simulate merging logic
    if (files.length > 0) {
      // First file might be MyKad
      mergedData = {
        ...mergedData,
        nric: '880101-14-5566',
        claimantName: 'Ahmad bin Zulkifli',
        mobileNumber: '+60123456789',
      };
    }

    if (files.length > 1) {
      // Second file might be Police Report or Grant
      mergedData = {
        ...mergedData,
        vehiclePlate: 'WQX 9988',
        vehicleMake: 'Perodua',
        vehicleModel: 'Bezza',
        incidentDate: '2025-12-15',
        incidentTime: '14:30',
        description: 'The vehicle was hit from the rear by a motorcycle while waiting at a traffic light in Kuala Lumpur.',
      };
    }

    return mergedData;
  };

  return { extractData, isExtracting };
}
