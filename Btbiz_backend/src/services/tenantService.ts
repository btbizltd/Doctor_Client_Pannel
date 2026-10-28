import bcrypt from "bcrypt";

import { Doctor, type DoctorRole } from "../models/Doctor";
import { Tenant, type TenantType } from "../models/Tenant";
import {
  buildProviderLocationQuery,
  formatTenantAddress,
  geocodeAddressWithFallbacks,
} from "./geocodeService";
import { resolveGoogleMapsLocation } from "../utils/googleMapsLink";

export interface CreatePartnerTenantPayload {
  tenantType: "PHARMACY" | "LAB";
  name: string;
  slug?: string;
  email: string;
  password: string;
  phone: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    mapUrl?: string;
  };
}

const cleanMapUrl = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeIndianPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.startsWith("+")) return raw;
  return `+91${digits.slice(-10)}`;
};

export const slugifyTenantName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "tenant";

const roleForTenantType = (tenantType: "PHARMACY" | "LAB"): DoctorRole =>
  tenantType === "PHARMACY" ? "PHARMACY" : "LAB_MANAGER";

const buildTenantId = (tenantType: TenantType, slug: string): string => {
  const prefix =
    tenantType === "PHARMACY" ? "pharmacy" : tenantType === "LAB" ? "lab" : "clinic";
  return `${prefix}_${slug}_${Date.now().toString(36)}`;
};

export const createPartnerTenant = async (
  payload: CreatePartnerTenantPayload
): Promise<{ tenant: ITenantResponse; owner: { id: string; email: string; role: DoctorRole } }> => {
  const { tenantType, name, email, password, phone, address } = payload;
  const slug = (payload.slug?.trim() || slugifyTenantName(name)).toLowerCase();
  const normalizedPhone = normalizeIndianPhone(phone);

  const slugTaken = await Tenant.findOne({ slug }).lean();
  if (slugTaken) {
    throw new Error("SLUG_ALREADY_EXISTS");
  }

  const existingUser = await Doctor.findOne({
    $or: [{ email: email.trim().toLowerCase() }, { phone: normalizedPhone }],
  });
  if (existingUser) {
    throw new Error("EMAIL_ALREADY_EXISTS");
  }

  const mapUrl = cleanMapUrl(address?.mapUrl);
  const linkPin = mapUrl ? await resolveGoogleMapsLocation(mapUrl) : null;

  const tenantId = buildTenantId(tenantType, slug);
  const passwordHash = await bcrypt.hash(password, 10);
  const role = roleForTenantType(tenantType);

  let ownerId: string | null = null;
  try {
    const locationQuery = buildProviderLocationQuery(address, undefined, name.trim());
    let clinicLatitude: number | undefined;
    let clinicLongitude: number | undefined;
    let clinicAddress: string | undefined;
    if (linkPin) {
      clinicLatitude = linkPin.lat;
      clinicLongitude = linkPin.lng;
      clinicAddress = formatTenantAddress(address) ?? name.trim();
    } else if (locationQuery) {
      const coords = await geocodeAddressWithFallbacks(locationQuery, name.trim());
      if (coords) {
        clinicLatitude = coords.lat;
        clinicLongitude = coords.lng;
        clinicAddress = locationQuery.replace(/, India$/i, "");
      }
    }

    const owner = await Doctor.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: normalizedPhone,
      passwordHash,
      role,
      status: true,
      tenantId,
      tenantType,
      ...(clinicLatitude != null && { clinicLatitude }),
      ...(clinicLongitude != null && { clinicLongitude }),
      ...(clinicAddress && { clinicAddress }),
    });
    ownerId = owner._id.toString();

    const tenant = await Tenant.create({
      _id: tenantId,
      tenantType,
      name: name.trim(),
      slug,
      ownerUserId: ownerId,
      phone: normalizedPhone,
      address: address ? { ...address, mapUrl: mapUrl || undefined } : undefined,
      subscription: { plan: "FREE", status: "ACTIVE" },
      status: "ACTIVE",
    });

    return {
      tenant: toTenantResponse(tenant),
      owner: { id: ownerId, email: owner.email, role: owner.role },
    };
  } catch (err) {
    if (ownerId) {
      await Doctor.findByIdAndDelete(ownerId).catch(() => undefined);
    }
    throw err;
  }
};

type TenantAddress = NonNullable<CreatePartnerTenantPayload["address"]>;

export interface ITenantResponse {
  id: string;
  tenantType: TenantType;
  name: string;
  slug: string;
  status: string;
  phone?: string;
  address?: TenantAddress;
  ownerUserId?: string;
  ownerEmail?: string;
  ownerName?: string;
  /** True when the owner account has a map pin (patients see km distance). */
  locationSet?: boolean;
  createdAt: string;
}

const toTenantResponse = (t: {
  _id: string;
  tenantType: TenantType;
  name: string;
  slug: string;
  status: string;
  phone?: string;
  address?: TenantAddress;
  ownerUserId?: string;
  createdAt?: Date;
}): ITenantResponse => ({
  id: t._id,
  tenantType: t.tenantType,
  name: t.name,
  slug: t.slug,
  status: t.status,
  phone: t.phone,
  address: t.address,
  ownerUserId: t.ownerUserId,
  createdAt: t.createdAt?.toISOString() ?? new Date().toISOString(),
});

const hasMapPin = (doc?: { clinicLatitude?: number; clinicLongitude?: number } | null): boolean =>
  typeof doc?.clinicLatitude === "number" && typeof doc?.clinicLongitude === "number";

const addressKey = (addr?: TenantAddress): string =>
  [addr?.line1, addr?.city, addr?.state, addr?.pincode]
    .map((p) => (typeof p === "string" ? p.trim().replace(/\s+/g, " ").toLowerCase() : ""))
    .join("|");

export interface UpdatePartnerTenantPayload {
  name?: string;
  slug?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: "ACTIVE" | "SUSPENDED" | "TRIAL";
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    mapUrl?: string;
  };
}

export const updatePartnerTenant = async (
  tenantId: string,
  payload: UpdatePartnerTenantPayload
): Promise<ITenantResponse> => {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }

  const updates: Record<string, unknown> = {};
  if (payload.name?.trim()) {
    updates.name = payload.name.trim();
  }
  if (payload.slug?.trim()) {
    const slug = payload.slug.trim().toLowerCase();
    const slugTaken = await Tenant.findOne({ slug, _id: { $ne: tenantId } }).lean();
    if (slugTaken) {
      throw new Error("SLUG_ALREADY_EXISTS");
    }
    updates.slug = slug;
  }
  if (payload.status) {
    updates.status = payload.status;
  }
  const mapUrl = cleanMapUrl(payload.address?.mapUrl);
  if (payload.address) {
    updates.address = { ...payload.address, mapUrl: mapUrl || undefined };
  }

  let normalizedPhone: string | undefined;
  if (payload.phone?.trim()) {
    normalizedPhone = normalizeIndianPhone(payload.phone);
    updates.phone = normalizedPhone;
  }

  // Re-pin only when the location input really changed (or the owner has no pin yet), so a saved location stays
  // put across unrelated edits. A Google Maps link, when given, is the pin source; otherwise the address is
  // geocoded. Resolve before any write: a location that cannot be found must not half-save.
  let ownerLocation: { clinicLatitude?: number; clinicLongitude?: number; clinicAddress?: string } | undefined;
  if (payload.address && tenant.ownerUserId) {
    const owner = await Doctor.findById(tenant.ownerUserId).select("clinicLatitude clinicLongitude").lean();
    const addressChanged = addressKey(payload.address) !== addressKey(tenant.address ?? undefined);
    const mapUrlChanged = mapUrl !== cleanMapUrl(tenant.address?.mapUrl);
    const displayName =
      (typeof updates.name === "string" ? updates.name : tenant.name) || tenant.name;
    if (mapUrl && (mapUrlChanged || !hasMapPin(owner))) {
      const pin = await resolveGoogleMapsLocation(mapUrl);
      ownerLocation = {
        clinicLatitude: pin.lat,
        clinicLongitude: pin.lng,
        clinicAddress: formatTenantAddress(payload.address) ?? displayName,
      };
    } else if (mapUrl && addressChanged) {
      ownerLocation = { clinicAddress: formatTenantAddress(payload.address) ?? displayName };
    } else if (!mapUrl && (addressChanged || !hasMapPin(owner))) {
      const locationQuery = buildProviderLocationQuery(payload.address, undefined, displayName);
      const coords = locationQuery
        ? await geocodeAddressWithFallbacks(locationQuery, displayName)
        : null;
      if (!locationQuery || !coords) {
        throw new Error("LOCATION_NOT_FOUND");
      }
      ownerLocation = {
        clinicLatitude: coords.lat,
        clinicLongitude: coords.lng,
        clinicAddress: locationQuery.replace(/, India$/i, ""),
      };
    }
  }

  if (tenant.ownerUserId) {
    const ownerUpdates: Record<string, unknown> = {};
    if (updates.name) {
      ownerUpdates.name = updates.name;
    }
    if (normalizedPhone) {
      ownerUpdates.phone = normalizedPhone;
    }
    if (payload.email?.trim()) {
      const email = payload.email.trim().toLowerCase();
      const emailTaken = await Doctor.findOne({
        email,
        _id: { $ne: tenant.ownerUserId },
      }).lean();
      if (emailTaken) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }
      ownerUpdates.email = email;
    }
    if (payload.password?.trim()) {
      ownerUpdates.passwordHash = await bcrypt.hash(payload.password, 10);
    }
    if (payload.status) {
      ownerUpdates.status = payload.status === "ACTIVE";
    }
    if (ownerLocation) {
      Object.assign(ownerUpdates, ownerLocation);
    }
    if (Object.keys(ownerUpdates).length > 0) {
      await Doctor.findByIdAndUpdate(tenant.ownerUserId, ownerUpdates);
    }
  }

  const updated = await Tenant.findByIdAndUpdate(tenantId, updates, { new: true }).lean();
  if (!updated) {
    throw new Error("TENANT_NOT_FOUND");
  }

  const listed = await listTenants(updated.tenantType);
  const match = listed.find((t) => t.id === tenantId);
  if (!match) {
    return toTenantResponse(updated as Parameters<typeof toTenantResponse>[0]);
  }
  return match;
};

export const deletePartnerTenant = async (tenantId: string): Promise<void> => {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    throw new Error("TENANT_NOT_FOUND");
  }
  if (tenant.ownerUserId) {
    await Doctor.findByIdAndDelete(tenant.ownerUserId);
  }
  await Tenant.findByIdAndDelete(tenantId);
};

export interface UpdateLegacyPartnerPayload {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  status?: boolean;
}

export const updateLegacyPartner = async (
  doctorId: string,
  payload: UpdateLegacyPartnerPayload
): Promise<void> => {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    throw new Error("PARTNER_NOT_FOUND");
  }
  if (doctor.role !== "PHARMACY" && doctor.role !== "LAB_MANAGER") {
    throw new Error("INVALID_PARTNER_ROLE");
  }
  if (doctor.tenantId) {
    throw new Error("USE_TENANT_ENDPOINT");
  }

  const updates: Record<string, unknown> = {};
  if (payload.name?.trim()) {
    updates.name = payload.name.trim();
  }
  if (payload.phone?.trim()) {
    updates.phone = normalizeIndianPhone(payload.phone);
  }
  if (payload.email?.trim()) {
    const email = payload.email.trim().toLowerCase();
    const emailTaken = await Doctor.findOne({ email, _id: { $ne: doctorId } }).lean();
    if (emailTaken) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }
    updates.email = email;
  }
  if (payload.password?.trim()) {
    updates.passwordHash = await bcrypt.hash(payload.password, 10);
  }
  if (typeof payload.status === "boolean") {
    updates.status = payload.status;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  await Doctor.findByIdAndUpdate(doctorId, updates);
};

export const deleteLegacyPartner = async (doctorId: string): Promise<void> => {
  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) {
    throw new Error("PARTNER_NOT_FOUND");
  }
  if (doctor.role !== "PHARMACY" && doctor.role !== "LAB_MANAGER") {
    throw new Error("INVALID_PARTNER_ROLE");
  }
  if (doctor.tenantId) {
    throw new Error("USE_TENANT_ENDPOINT");
  }
  await Doctor.findByIdAndDelete(doctorId);
};

export const listTenants = async (
  tenantType?: TenantType
): Promise<ITenantResponse[]> => {
  const filter = tenantType ? { tenantType } : {};
  const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).lean();

  const ownerIds = tenants
    .map((t) => t.ownerUserId)
    .filter((id): id is string => !!id);

  const owners =
    ownerIds.length > 0
      ? await Doctor.find({ _id: { $in: ownerIds } })
          .select("name email clinicLatitude clinicLongitude")
          .lean()
      : [];

  const ownerMap = new Map(owners.map((o) => [o._id.toString(), o]));

  return tenants.map((t) => {
    const owner = t.ownerUserId ? ownerMap.get(t.ownerUserId) : undefined;
    return {
      ...toTenantResponse(t as Parameters<typeof toTenantResponse>[0]),
      ownerEmail: owner?.email,
      ownerName: owner?.name,
      locationSet: hasMapPin(owner),
    };
  });
};
