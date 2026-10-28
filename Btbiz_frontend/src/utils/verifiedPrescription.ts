import type { FullPatientHistory } from '../services/api'

type HistoryDocument = FullPatientHistory['documents'][number]

export interface VerifiedPrescriptionPick {
  /** Latest assistant-verified prescription released to the patient profile (null when none). */
  document: HistoryDocument | null
  /** True when a newer upload is still waiting for assistant verification. */
  hasNewerPending: boolean
}

const isVerifiedAndReleased = (d: HistoryDocument): boolean =>
  Boolean(d.verifiedAt) && d.patientPublishStatus !== 'PENDING_ASSISTANT'

const timeOf = (value?: string): number => {
  const t = value ? new Date(value).getTime() : NaN
  return Number.isFinite(t) ? t : 0
}

export function pickLatestVerifiedPrescription(
  history: Pick<FullPatientHistory, 'documents' | 'lastPrescription'>
): VerifiedPrescriptionPick {
  const documents = history.documents ?? []

  let document: HistoryDocument | null = null
  const preferredId = history.lastPrescription?.documentId
  if (preferredId) {
    document = documents.find((d) => d.id === preferredId && isVerifiedAndReleased(d)) ?? null
  }
  if (!document) {
    for (const d of documents) {
      if (!isVerifiedAndReleased(d)) continue
      if (!document || timeOf(d.verifiedAt) > timeOf(document.verifiedAt)) document = d
    }
  }

  const pickedUploadedAt = document ? timeOf(document.uploadedAt) : -1
  const hasNewerPending = documents.some(
    (d) => d.patientPublishStatus === 'PENDING_ASSISTANT' && timeOf(d.uploadedAt) > pickedUploadedAt
  )

  return { document, hasNewerPending }
}
