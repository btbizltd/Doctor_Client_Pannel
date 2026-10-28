import { patientService, type FullPatientHistory } from '../services/api'
import { pickLatestVerifiedPrescription } from '../utils/verifiedPrescription'
import { Button } from './ui/Button'

interface VerifiedPrescriptionActionProps {
  patientId: string
  history: Pick<FullPatientHistory, 'documents' | 'lastPrescription'>
}

export function VerifiedPrescriptionAction({ patientId, history }: VerifiedPrescriptionActionProps) {
  const { document, hasNewerPending } = pickLatestVerifiedPrescription(history)
  const pendingNote = hasNewerPending
    ? 'A newer prescription is awaiting assistant verification.'
    : null

  if (!document) {
    return (
      <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
        {pendingNote ?? 'No verified prescription for this patient yet.'}
      </p>
    )
  }

  const verifiedOn = document.verifiedAt
    ? new Date(document.verifiedAt).toLocaleDateString('en-IN')
    : null

  return (
    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          void patientService.openDocument(patientId, document.id, { assistantVerified: true })
        }
      >
        View prescription (secure)
      </Button>
      <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>
        Latest verified prescription{verifiedOn ? ` · verified ${verifiedOn}` : ''}
        {pendingNote ? ` · ${pendingNote}` : ''}
      </span>
    </div>
  )
}
