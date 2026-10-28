export type FamilyMemberFormField = 'fullName' | 'relation' | 'gender' | 'dob' | 'address'

export interface FamilyMemberFormValues {
  fullName: string
  relation: string
  gender: string
  dob: string
  address: string
  /** Completed age from `dob`, or null when the date is missing or invalid. */
  ageYears: number | null
}

export const MSG_SELF_MIN_AGE =
  'For Self, age must be 18 years or above. Please enter a valid date of birth.'

/** Field errors for the family member form; an empty object means the form can be saved. */
export function validateFamilyMemberForm(
  values: FamilyMemberFormValues
): Partial<Record<FamilyMemberFormField, string>> {
  const errors: Partial<Record<FamilyMemberFormField, string>> = {}
  if (!values.fullName.trim()) errors.fullName = 'Please enter full name.'
  if (!values.relation) errors.relation = 'Please select relation.'
  if (!values.gender) errors.gender = 'Please select gender.'
  if (!values.dob) {
    errors.dob = 'Please enter date of birth.'
  } else if (values.ageYears === null || values.ageYears < 0) {
    errors.dob = 'Please enter a valid date of birth.'
  } else if (values.relation === 'SELF' && values.ageYears < 18) {
    errors.dob = MSG_SELF_MIN_AGE
  }
  if (!values.address.trim()) errors.address = 'Please enter address.'
  return errors
}

/** `<input type="date">` needs YYYY-MM-DD; stored values may be full ISO timestamps. */
export function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}
