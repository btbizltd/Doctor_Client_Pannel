import type { DoctorRole } from "../models/Doctor";

/** Staff login options shown on the website; each only accepts its own roles. */
export const LOGIN_PORTAL_ROLES = {
  doctor: ["DOCTOR"],
  "lab-manager": ["LAB_MANAGER"],
  "assistant-lab": ["ASSISTANT", "LAB_ASSISTANT"],
  pharmacy: ["PHARMACY"]
} as const satisfies Record<string, readonly DoctorRole[]>;

export type LoginPortal = keyof typeof LOGIN_PORTAL_ROLES;

const PORTAL_LABEL_FOR_ROLE: Record<DoctorRole, string> = {
  DOCTOR: "Doctor",
  LAB_MANAGER: "Lab Manager",
  ASSISTANT: "Assistant / Lab",
  LAB_ASSISTANT: "Assistant / Lab",
  PHARMACY: "Pharmacy"
};

export const isLoginPortal = (value: unknown): value is LoginPortal =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(LOGIN_PORTAL_ROLES, value);

export const portalAllowsRole = (portal: LoginPortal, role: DoctorRole): boolean =>
  (LOGIN_PORTAL_ROLES[portal] as readonly DoctorRole[]).includes(role);

export const portalLabelForRole = (role: DoctorRole): string => PORTAL_LABEL_FOR_ROLE[role] ?? role;
