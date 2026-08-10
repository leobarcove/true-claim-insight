/**
 * Hooks for the digital signature lifecycle on a Document. The backend
 * lives in case-service/signatures; api-gateway proxies under
 * /api/v1/documents/:id/{request,complete,cancel}-signature.
 *
 * Each mutation invalidates the claim detail query so the document
 * row's status badge updates automatically.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiResponse } from '@/lib/api-client';
import { claimKeys } from './use-claims';

interface SignatureDocument {
  id: string;
  signatureStatus: 'NOT_REQUESTED' | 'PENDING' | 'SIGNED' | 'EXPIRED' | 'CANCELLED';
  signatureUrl?: string | null;
  signatureRequestId?: string | null;
  signatureRequestedAt?: string | null;
  signedAt?: string | null;
  signedStorageUrl?: string | null;
}

function postNoBody(documentId: string, action: string) {
  return apiClient.post<ApiResponse<SignatureDocument>>(
    `/documents/${documentId}/${action}`
  );
}

/**
 * NOT_REQUESTED -> PENDING. Returns the updated Document row.
 */
export function useRequestSignature(claimId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await postNoBody(documentId, 'request-signature');
      return data.data;
    },
    onSuccess: () => {
      if (claimId) {
        queryClient.invalidateQueries({ queryKey: claimKeys.detail(claimId) });
      }
    },
  });
}

/**
 * PENDING -> SIGNED. Stands in for the vendor webhook — call it from
 * the UI in dev to simulate the claimant completing signing.
 */
export function useCompleteSignature(claimId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await postNoBody(documentId, 'complete-signature');
      return data.data;
    },
    onSuccess: () => {
      if (claimId) {
        queryClient.invalidateQueries({ queryKey: claimKeys.detail(claimId) });
      }
    },
  });
}

/**
 * PENDING -> CANCELLED.
 */
export function useCancelSignature(claimId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await postNoBody(documentId, 'cancel-signature');
      return data.data;
    },
    onSuccess: () => {
      if (claimId) {
        queryClient.invalidateQueries({ queryKey: claimKeys.detail(claimId) });
      }
    },
  });
}
