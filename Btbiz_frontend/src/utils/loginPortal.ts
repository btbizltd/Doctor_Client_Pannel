/** Website login options; the backend only accepts accounts whose role belongs to the chosen option. */
export type StaffLoginPortal = 'doctor' | 'lab-manager' | 'assistant-lab' | 'pharmacy'
export type LoginPortal = StaffLoginPortal | 'super-admin'

export const LOGIN_PORTALS: Array<{ id: LoginPortal; label: string }> = [
  { id: 'doctor', label: 'Doctor' },
  { id: 'lab-manager', label: 'Lab Manager' },
  { id: 'assistant-lab', label: 'Assistant / Lab' },
  { id: 'pharmacy', label: 'Pharmacy' },
  { id: 'super-admin', label: 'Super Admin' },
]

export function parseLoginPortal(value: string | null | undefined): LoginPortal | null {
  return LOGIN_PORTALS.some((p) => p.id === value) ? (value as LoginPortal) : null
}

const PORTAL_FOR_ROLE: Record<string, LoginPortal> = {
  DOCTOR: 'doctor',
  LAB_MANAGER: 'lab-manager',
  ASSISTANT: 'assistant-lab',
  LAB_ASSISTANT: 'assistant-lab',
  PHARMACY: 'pharmacy',
  SUPER_ADMIN: 'super-admin',
}

/** Login page URL with the login option preselected for a role (plain /login when unknown). */
export function loginPathForRole(role: string | null | undefined): string {
  const portal = role ? PORTAL_FOR_ROLE[role] : undefined
  return portal ? `/login?role=${portal}` : '/login'
}
