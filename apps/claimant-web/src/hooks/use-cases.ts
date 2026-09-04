import { apiClient, ApiResponse } from '@/lib/api-client';

/**
 * What the claimant app still does to a Case directly: upload a document.
 *
 * Everything else it used to do — create the case, patch each answer, fetch the
 * pinned flow, submit — moved to `ConversationGateway` on 11 Aug 2026, and the
 * hooks that did it here were left behind unreferenced. They are deleted rather
 * than kept "in case": a second write path into intake is exactly the drift the
 * one-engine change existed to remove, and an unused hook is an invitation to
 * reintroduce it.
 *
 * The upload stays a plain call, not a turn. Bytes never travel through the
 * conversation: the file is stored and validated by the endpoint that owns
 * documents, and only the resulting id is named on the next turn, which the
 * server then checks belongs to this case.
 */
export async function uploadCaseDocument(
  caseId: string,
  file: File,
  documentType: string,
  stepId: string
) {
  const formData = new FormData();
  formData.append('type', documentType);
  formData.append('stepId', stepId);
  formData.append('file', file);
  const { data } = await apiClient.post<ApiResponse<{ id: string }>>(
    `/cases/${caseId}/documents/upload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return data.data;
}
