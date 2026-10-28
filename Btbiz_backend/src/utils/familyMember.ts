const normalizeName = (name: unknown): string =>
  String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const toDayKey = (value: unknown): string | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/**
 * Finds an existing member (already filtered to the same account + relation) that is the same person
 * as the incoming one: same name ignoring case/extra spaces, and same DOB when both sides have one.
 */
export function findDuplicateFamilyMember<T extends { fullName?: unknown; dateOfBirth?: unknown }>(
  existing: T[],
  incoming: { fullName: string; dateOfBirth?: Date }
): T | undefined {
  const name = normalizeName(incoming.fullName);
  if (!name) return undefined;
  const dob = toDayKey(incoming.dateOfBirth);
  return existing.find((member) => {
    if (normalizeName(member.fullName) !== name) return false;
    const memberDob = toDayKey(member.dateOfBirth);
    return !dob || !memberDob || dob === memberDob;
  });
}
