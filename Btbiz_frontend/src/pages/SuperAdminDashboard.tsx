import { useMemo, useRef, useState, useEffect, useCallback, type ChangeEvent } from 'react'
import { toast } from 'react-toastify'

import { Header } from '../components/Header'
import { AppLayout } from '../components/layout/AppLayout'
import { Card } from '../components/ui/Card'
import { DataTable } from '../components/ui/DataTable'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { StatCard } from '../components/ui/StatCard'
import { LabIcon, PharmacyIcon, UserIcon } from '../components/ui/icons'
import { SuperAdminDoctorEditor } from '../components/SuperAdminDoctorEditor'
import { TextField } from '../components/ui/TextField'
import { doctorInitials } from '../utils/doctorDirectory'
import {
  LOW_ACCURACY_METERS,
  describeAccuracy,
  formatCoordinates,
  mapCheckHref,
} from '../utils/mapLocation'
import { authStorage } from '../utils/authStorage'
import {
  authService,
  type SuperAdminListItem,
  type SuperAdminOverview,
  type SuperAdminTenant,
} from '../services/api'

type CardKey = 'doctors' | 'assistants' | 'labAssistants' | 'pharmacies' | 'labs' | 'diagnostics'

const CARD_KEYS: CardKey[] = [
  'doctors',
  'assistants',
  'labAssistants',
  'pharmacies',
  'labs',
  'diagnostics',
]
const cardTitleMap: Record<CardKey, string> = {
  doctors: 'Doctors',
  assistants: 'Assistants',
  labAssistants: 'Lab Assistants',
  pharmacies: 'Pharmacies (Tenants)',
  labs: 'Labs (Tenants)',
  diagnostics: 'Diagnostics',
}

const emptyPartnerForm = () => ({
  name: '',
  slug: '',
  email: '',
  password: '',
  phone: '',
  addressLine1: '',
  addressCity: '',
  addressPincode: '',
  mapUrl: '',
  statusActive: true,
})

const confirmCenterToast = (
  message: string,
  onConfirm: () => void | Promise<void>
) => {
  toast(
    ({ closeToast }) => (
      <div style={{ textAlign: 'center', minWidth: 220 }}>
        <p className="medigraph-toast-confirm-message">{message}</p>
        <div className="medigraph-toast-confirm-actions">
          <button
            type="button"
            className="public-cta"
            onClick={() => {
              void (async () => {
                closeToast?.()
                await onConfirm()
              })()
            }}
          >
            Yes, confirm
          </button>
          <button type="button" className="public-cta-secondary" onClick={() => closeToast?.()}>
            Cancel
          </button>
        </div>
      </div>
    ),
    {
      position: 'top-center',
      autoClose: false,
      closeOnClick: false,
      draggable: false,
      closeButton: false,
      className: 'medigraph-toastify-toast medigraph-toastify-confirm',
    }
  )
}

export const SuperAdminDashboard = () => {
  const name = authStorage.getName() ?? 'Super Admin'
  const [overview, setOverview] = useState<SuperAdminOverview | null>(null)
  const [pharmacyTenants, setPharmacyTenants] = useState<SuperAdminTenant[]>([])
  const [labTenants, setLabTenants] = useState<SuperAdminTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openCard, setOpenCard] = useState<CardKey | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<SuperAdminTenant | null>(null)
  const [form, setForm] = useState(emptyPartnerForm)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locateInfo, setLocateInfo] = useState<{ value: string; accuracy: number } | null>(null)
  const locateRequestRef = useRef(0)
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null)
  const [doctorQuery, setDoctorQuery] = useState('')
  const closeDoctorEditor = useCallback(() => setEditingDoctorId(null), [])

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [data, pharmacies, labs] = await Promise.all([
        authService.getSuperAdminOverview(),
        authService.getSuperAdminTenants('PHARMACY'),
        authService.getSuperAdminTenants('LAB'),
      ])
      setOverview(data)
      setPharmacyTenants(pharmacies)
      setLabTenants(labs)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Unable to load super admin dashboard data.'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!overview) return
    const pendingCount = overview.summary.pendingDoctorApprovals ?? 0
    if (pendingCount > 0) {
      toast.info(
        `${pendingCount} doctor approval request${pendingCount > 1 ? 's' : ''} pending.`,
        { autoClose: 6000 }
      )
    }
  }, [overview])

  const resetFormState = () => {
    setShowForm(false)
    setEditTarget(null)
    setForm(emptyPartnerForm())
    locateRequestRef.current += 1
    setLocating(false)
    setLocateInfo(null)
  }

  const handleLocateMe = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      toast.error('Location is not available here. Open the site over https, or paste the shop’s coordinates.')
      return
    }
    const requestId = ++locateRequestRef.current
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (requestId !== locateRequestRef.current) return
        const value = formatCoordinates(pos.coords.latitude, pos.coords.longitude)
        setForm((f) => ({ ...f, mapUrl: value }))
        setLocateInfo({ value, accuracy: pos.coords.accuracy })
        setLocating(false)
      },
      (err) => {
        if (requestId !== locateRequestRef.current) return
        setLocating(false)
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Allow location for this site in the browser settings, then try again.'
            : err.code === err.TIMEOUT
              ? 'Finding your location took too long. Try again, ideally on a phone with GPS on.'
              : 'Could not find your location. Try again, or paste the shop’s coordinates.'
        )
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }

  useEffect(() => {
    if (!showForm || saving) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setShowForm(false)
      setEditTarget(null)
      setForm(emptyPartnerForm())
      locateRequestRef.current += 1
      setLocating(false)
      setLocateInfo(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForm, saving])

  const openCreateForm = () => {
    setEditTarget(null)
    setForm(emptyPartnerForm())
    setShowForm(true)
  }

  const openEditTenant = (tenant: SuperAdminTenant) => {
    setEditTarget(tenant)
    setForm({
      ...emptyPartnerForm(),
      name: tenant.name,
      slug: tenant.slug,
      email: tenant.ownerEmail ?? '',
      phone: tenant.phone ?? '',
      addressLine1: tenant.address?.line1 ?? '',
      addressCity: tenant.address?.city ?? '',
      addressPincode: tenant.address?.pincode ?? '',
      mapUrl: tenant.address?.mapUrl ?? '',
      statusActive: tenant.status === 'ACTIVE',
    })
    setShowForm(true)
  }

  const summaryCards = useMemo(() => {
    if (!overview) return []
    return [
      { key: 'doctors' as const, count: overview.summary.doctors },
      { key: 'assistants' as const, count: overview.summary.assistants },
      { key: 'labAssistants' as const, count: overview.summary.labAssistants },
      { key: 'pharmacies' as const, count: pharmacyTenants.length || overview.summary.pharmacies },
      { key: 'labs' as const, count: labTenants.length || overview.summary.labs },
      { key: 'diagnostics' as const, count: overview.summary.diagnostics },
    ]
  }, [overview, pharmacyTenants.length, labTenants.length])

  const filteredDoctors = useMemo(() => {
    const doctors = overview?.lists.doctors ?? []
    const query = doctorQuery.trim().toLowerCase()
    if (!query) return doctors
    return doctors.filter((doctor) => {
      const haystack = [
        doctor.name,
        doctor.email,
        doctor.phone,
        doctor.departmentLabel,
        doctor.department,
        doctor.specialization,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [overview, doctorQuery])

  const handleDeleteTenant = (tenant: SuperAdminTenant) => {
    confirmCenterToast('Are you sure you want to delete this tenant?', async () => {
      try {
        await authService.deleteSuperAdminTenant(tenant.id)
        toast.success(`${tenant.name} deleted successfully.`)
        if (editTarget?.id === tenant.id) {
          resetFormState()
        }
        await loadAll()
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to delete tenant.')
      }
    })
  }

  const handleDoctorApproval = (
    doctor: SuperAdminListItem,
    approvalStatus: 'APPROVED' | 'REJECTED'
  ) => {
    const actionText = approvalStatus === 'APPROVED' ? 'approve' : 'reject'
    confirmCenterToast(`Are you sure you want to ${actionText} ${doctor.name}?`, async () => {
      try {
        await authService.updateDoctorApproval(doctor.id, approvalStatus)
        toast.success(
          approvalStatus === 'APPROVED'
            ? `${doctor.name} approved successfully.`
            : `${doctor.name} rejected successfully.`
        )
        await loadAll()
      } catch (err: any) {
        toast.error(err?.response?.data?.message ?? 'Failed to update doctor approval.')
      }
    })
  }

  const handleSaveForm = async () => {
    if (openCard !== 'pharmacies' && openCard !== 'labs') return

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast.warning('Name, email, and phone are required.')
      return
    }

    const isCreate = !editTarget
    if (isCreate && !form.password) {
      toast.warning('Password is required for new tenants.')
      return
    }

    const tenantType = openCard === 'pharmacies' ? 'PHARMACY' : 'LAB'

    const buildAddress = (state: string | undefined) => {
      const line1 = form.addressLine1.trim()
      const city = form.addressCity.trim()
      const pincode = form.addressPincode.trim()
      const mapUrl = form.mapUrl.trim()
      if (!line1 && !city && !pincode && !mapUrl) return undefined
      return {
        line1: line1 || undefined,
        city: city || undefined,
        pincode: pincode || undefined,
        state,
        mapUrl,
      }
    }

    try {
      setSaving(true)

      if (editTarget) {
        const address = buildAddress(editTarget.address ? editTarget.address.state : 'Haryana')
        await authService.updateSuperAdminTenant(editTarget.id, {
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          email: form.email.trim(),
          phone: form.phone.trim(),
          password: form.password.trim() || undefined,
          status: form.statusActive ? 'ACTIVE' : 'SUSPENDED',
          address,
        })
        toast.success('Tenant updated successfully.')
      } else {
        const address = buildAddress('Haryana')
        const ownerEmail = form.email.trim().toLowerCase()
        const ownerPassword = form.password.trim()
        await authService.createSuperAdminTenant({
          tenantType,
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          email: ownerEmail,
          password: ownerPassword,
          phone: form.phone.trim(),
          address,
        })
        toast.success(
          `${tenantType === 'PHARMACY' ? 'Pharmacy' : 'Lab'} created. Owner logs in via "Login as ${
            tenantType === 'PHARMACY' ? 'Medicine' : 'Lab Manager'
          }" with email: ${ownerEmail}`,
          { autoClose: 12000 }
        )
      }

      resetFormState()
      await loadAll()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to save changes.')
    } finally {
      setSaving(false)
    }
  }

  const renderActions = (
    onEdit: () => void,
    onDelete: () => void
  ) => (
    <td className="super-admin-td-actions">
      <div className="super-admin-row-actions">
        <button
          type="button"
          className="ui-button ui-button-edit ui-button-sm"
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className="ui-button ui-button-danger-outline ui-button-sm"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </td>
  )

  const renderSimpleList = (items: SuperAdminListItem[]) => {
    if (items.length === 0) {
      return (
        <EmptyState
          className="super-admin-empty-state"
          icon={<UserIcon size={22} />}
          title="No records yet"
          message="New staff accounts will appear in this list."
        />
      )
    }

    const columns =
      openCard === 'doctors'
        ? [
            { label: 'Photo' },
            { label: 'Name' },
            { label: 'Department' },
            { label: 'Email' },
            { label: 'Phone' },
            { label: 'Status' },
            { label: 'Approval' },
            { label: 'Action', align: 'center' as const },
          ]
        : [
            { label: 'Name' },
            { label: 'Email' },
            { label: 'Phone' },
            { label: 'Status' },
          ]

    return (
      <DataTable
        className="super-admin-data-table"
        columns={columns}
        stickyHeader={items.length > 5}
      >
        {items.map((i) => (
          <tr key={i.id}>
            {openCard === 'doctors' && (
              <td>
                <span className="super-admin-doctor-thumb">
                  {i.photoUrl ? <img src={i.photoUrl} alt="" /> : doctorInitials(i.name)}
                </span>
              </td>
            )}
            <td>
              {i.name}
              {openCard === 'doctors' && i.isFeatured && <span className="super-admin-featured-tag">Featured</span>}
            </td>
            {openCard === 'doctors' && (
              <td>
                {i.departmentLabel ?? 'General Medicine'}
                {i.specialization && <div className="super-admin-td-sub">{i.specialization}</div>}
              </td>
            )}
            <td>{i.email}</td>
            <td>{i.phone}</td>
            <td className={i.status ? 'super-admin-td-status super-admin-td-status--active' : 'super-admin-td-status super-admin-td-status--inactive'}>
              {i.status ? 'Active' : 'Inactive'}
            </td>
            {openCard === 'doctors' && (
              <>
                <td
                  className={
                    i.approvalStatus === 'APPROVED'
                      ? 'super-admin-td-status super-admin-td-status--active'
                      : i.approvalStatus === 'REJECTED'
                        ? 'super-admin-td-status super-admin-td-status--inactive'
                        : 'super-admin-td-status super-admin-td-status--pending'
                  }
                >
                  {i.approvalStatus ?? 'APPROVED'}
                </td>
                <td className="super-admin-td-actions">
                  <div className="super-admin-row-actions">
                    <button
                      type="button"
                      className="ui-button ui-button-edit ui-button-sm"
                      onClick={() => setEditingDoctorId(i.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-sm"
                      disabled={i.approvalStatus === 'APPROVED'}
                      onClick={() => handleDoctorApproval(i, 'APPROVED')}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-danger-outline ui-button-sm"
                      disabled={i.approvalStatus === 'REJECTED'}
                      onClick={() => handleDoctorApproval(i, 'REJECTED')}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </>
            )}
          </tr>
        ))}
      </DataTable>
    )
  }

  const renderTenantList = (tenants: SuperAdminTenant[]) => {
    if (tenants.length === 0) {
      return (
        <EmptyState
          className="super-admin-empty-state"
          icon={openCard === 'pharmacies' ? <PharmacyIcon size={22} /> : <LabIcon size={22} />}
          title={`No ${openCard === 'pharmacies' ? 'pharmacies' : 'labs'} yet`}
          message={`Use Add ${openCard === 'pharmacies' ? 'pharmacy' : 'lab'} above to onboard a new tenant.`}
        />
      )
    }

    return (
      <DataTable
        className="super-admin-data-table"
        columns={[
          { label: 'Business' },
          { label: 'Slug' },
          { label: 'Owner login' },
          { label: 'Phone' },
          { label: 'Location' },
          { label: 'Status' },
          { label: 'Action', align: 'center' },
        ]}
        stickyHeader={tenants.length > 5}
      >
        {tenants.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td>{t.slug}</td>
            <td>
              {t.ownerEmail ?? '—'}
              {t.ownerName ? ` (${t.ownerName})` : ''}
            </td>
            <td>{t.phone ?? '—'}</td>
            <td>
              {[t.address?.line1, t.address?.city, t.address?.pincode].filter(Boolean).join(', ') || '—'}
              <br />
              <small style={{ color: t.locationSet ? '#166534' : '#b45309' }}>
                {t.locationSet
                  ? t.address?.mapUrl
                    ? 'Exact map pin set (link / coordinates)'
                    : 'Map pin set'
                  : 'Not set — Edit to add address or map link'}
              </small>
              {mapCheckHref(t.address?.mapUrl) && (
                <>
                  {' · '}
                  <a href={mapCheckHref(t.address?.mapUrl) ?? undefined} target="_blank" rel="noopener noreferrer">
                    <small>Open map</small>
                  </a>
                </>
              )}
            </td>
            <td className={t.status === 'ACTIVE' ? 'super-admin-td-status super-admin-td-status--active' : 'super-admin-td-status super-admin-td-status--inactive'}>
              {t.status}
            </td>
            {renderActions(
              () => openEditTenant(t),
              () => handleDeleteTenant(t)
            )}
          </tr>
        ))}
      </DataTable>
    )
  }
  const renderPartnerForm = () => {
    const isEdit = !!editTarget
    const kind = openCard === 'pharmacies' ? 'pharmacy' : 'lab'
    const close = () => {
      if (!saving) resetFormState()
    }
    const field = (key: keyof Omit<ReturnType<typeof emptyPartnerForm>, 'statusActive'>) => ({
      value: form[key],
      onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
      disabled: saving,
    })
    return (
      <div className="super-admin-modal-backdrop" role="presentation" onClick={close}>
        <div
          className="super-admin-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sa-tenant-form-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="super-admin-modal-header">
            <p className="dashboard-kicker" id="sa-tenant-form-title">
              {editTarget ? `Edit ${kind} — ${editTarget.name}` : `Add new ${kind}`}
            </p>
            <button type="button" className="super-admin-modal-close" onClick={close} disabled={saving} aria-label="Close">
              ×
            </button>
          </div>

          <form
            id="sa-tenant-form"
            className="super-admin-modal-body"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSaveForm()
            }}
          >
            <div className="super-admin-modal-grid">
              <TextField id="sa-tenant-name" label="Business name *" autoFocus {...field('name')} />
              <TextField id="sa-tenant-slug" label="URL slug (optional)" placeholder="e.g. medplus" {...field('slug')} />
              <TextField id="sa-tenant-email" label="Owner email *" type="email" {...field('email')} />
              <TextField id="sa-tenant-phone" label="Phone *" type="tel" {...field('phone')} />
              <TextField
                id="sa-tenant-password"
                label={isEdit ? 'New password' : 'Owner password *'}
                hint={isEdit ? 'Leave blank to keep the current password.' : undefined}
                type="password"
                autoComplete="new-password"
                canTogglePassword
                {...field('password')}
              />
            </div>

            <p className="dashboard-kicker" style={{ margin: 0 }}>Shop location</p>
            <div className="super-admin-modal-grid">
              <TextField id="sa-tenant-line1" label="Shop address line" {...field('addressLine1')} />
              <TextField id="sa-tenant-city" label="City" placeholder="e.g. Gurgaon, Faridabad" {...field('addressCity')} />
              <TextField id="sa-tenant-pincode" label="Pincode" inputMode="numeric" {...field('addressPincode')} />
            </div>
            <TextField
              id="sa-tenant-map-url"
              label="Google Maps link or coordinates (for exact location)"
              placeholder="https://maps.app.goo.gl/...  or  28.4089, 77.3178"
              hint="Google Maps → open the shop → Share → Copy link. Or right-click / long-press the shop's pin and copy the coordinates. When set, patients' km distance uses this exact pin instead of the address."
              {...field('mapUrl')}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="ui-button ui-button-secondary ui-button-sm"
                onClick={handleLocateMe}
                disabled={saving || locating}
              >
                {locating ? 'Finding location…' : 'Locate me'}
              </button>
              <small style={{ color: 'var(--text-muted)' }}>
                Use only while standing at the shop — it uses this device’s location.
              </small>
            </div>
            {locateInfo && locateInfo.value === form.mapUrl && (
              <p
                role="status"
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: locateInfo.accuracy > LOW_ACCURACY_METERS ? '#b45309' : '#166534',
                }}
              >
                {locateInfo.accuracy > LOW_ACCURACY_METERS
                  ? `Low accuracy (${describeAccuracy(locateInfo.accuracy)}). This device is probably not using GPS, so the pin may be far from the shop. Use a phone at the shop, or paste the shop’s coordinates from Google Maps.`
                  : `Location found (${describeAccuracy(locateInfo.accuracy)}). Check the pin, then save.`}
              </p>
            )}
            {mapCheckHref(form.mapUrl) && (
              <a href={mapCheckHref(form.mapUrl) ?? undefined} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
                Check this location on Google Maps
              </a>
            )}

            <label className="super-admin-modal-check">
              <input
                type="checkbox"
                checked={form.statusActive}
                disabled={saving}
                onChange={(e) => setForm((f) => ({ ...f, statusActive: e.target.checked }))}
              />
              Active account
            </label>
          </form>

          <div className="super-admin-modal-footer">
            <button type="submit" form="sa-tenant-form" className="public-cta" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : `Create ${kind}`}
            </button>
            <button type="button" className="public-cta-secondary" onClick={close} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderCardContent = () => {
    if (!overview || !openCard) return null
    if (openCard === 'doctors') {
      const total = overview.lists.doctors.length
      return (
        <>
          {filteredDoctors.length === 0 ? (
            <EmptyState
              className="super-admin-empty-state"
              icon={<UserIcon size={22} />}
              title={total === 0 ? 'No records yet' : 'No matching doctors'}
              message={
                total === 0
                  ? 'New staff accounts will appear in this list.'
                  : `No doctor matches “${doctorQuery.trim()}”. Try another name or clear the search.`
              }
            />
          ) : (
            renderSimpleList(filteredDoctors)
          )}
        </>
      )
    }
    if (openCard === 'assistants') return renderSimpleList(overview.lists.assistants)
    if (openCard === 'labAssistants') return renderSimpleList(overview.lists.labAssistants)
    if (openCard === 'pharmacies') return renderTenantList(pharmacyTenants)
    if (openCard === 'labs') return renderTenantList(labTenants)
    return (
      <p className="dashboard-body">
        Total diagnostics records in system: <strong>{overview.summary.diagnostics}</strong>
      </p>
    )
  }

  const canAddPartner = openCard === 'pharmacies' || openCard === 'labs'

  const handleGeocodePartners = async () => {
    const kind = openCard === 'pharmacies' ? 'pharmacy' : 'lab'
    try {
      setGeocoding(true)
      const { results } = await authService.geocodeSuperAdminPartners(kind)
      const lines = results.map((r) => `${r.kind}: ${r.updated} updated, ${r.failed} still without map`)
      toast.success(`Map locations saved. ${lines.join('; ')}`)
      await loadAll()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Could not update map locations.')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <AppLayout
      showSidebar
      header={<Header clinicName="Super Admin Dashboard" doctorName={name} />}
    >
      <main className="dashboard-main super-admin-dashboard-main">
        <section className="super-admin-dashboard-section">
          <PageHeader
            className="super-admin-page-header"
            title="Super Admin"
            subtitle="Add pharmacy and lab tenants, approve doctors, and manage staff. Fill shop address (city + pincode) so patients see km distance — use Fix km distance after adding shops."
          />

          {!!overview && overview.summary.pendingDoctorApprovals > 0 && (
            <Card className="dashboard-overview-card super-admin-alert-card">
              <p className="super-admin-alert-copy">
                {overview.summary.pendingDoctorApprovals} doctor approval request
                {overview.summary.pendingDoctorApprovals > 1 ? 's are' : ' is'} pending.
                Open <strong>Doctors</strong> below to approve or reject.
              </p>
            </Card>
          )}

          <div className="super-admin-stats">
            {CARD_KEYS.map((key) => {
              const card = summaryCards.find((c) => c.key === key)
              const isActive = openCard === key
              return (
                <StatCard
                  key={key}
                  className={`super-admin-stat-card${isActive ? ' super-admin-stat-card--active' : ''}`}
                  title={cardTitleMap[key]}
                  value={loading ? <Skeleton width={48} height={30} /> : (card?.count ?? '—')}
                  trend={
                    key === 'doctors' && overview && overview.summary.pendingDoctorApprovals > 0
                      ? {
                          label: `${overview.summary.pendingDoctorApprovals} pending approval`,
                          direction: 'neutral',
                        }
                      : undefined
                  }
                  disabled={loading}
                  onClick={() => {
                    setOpenCard(key)
                    setDoctorQuery('')
                    resetFormState()
                  }}
                />
              )
            })}
          </div>

          {error && (
            <p className="dashboard-body super-admin-error-copy">{error}</p>
          )}

          {openCard && (
            <Card className="dashboard-overview-card super-admin-panel-card">
              <div className="super-admin-panel-header">
                <p className="dashboard-kicker super-admin-panel-kicker">{cardTitleMap[openCard]}</p>
                {openCard === 'doctors' && overview && (
                  <div className="super-admin-doctor-search">
                    <span className="super-admin-doctor-search-count">
                      {doctorQuery.trim()
                        ? `${filteredDoctors.length} of ${overview.lists.doctors.length}`
                        : `${overview.lists.doctors.length} doctor${overview.lists.doctors.length === 1 ? '' : 's'}`}
                    </span>
                    <input
                      type="search"
                      value={doctorQuery}
                      onChange={(e) => setDoctorQuery(e.target.value)}
                      placeholder="Search doctors"
                      aria-label="Search doctors"
                    />
                  </div>
                )}
                {canAddPartner && !showForm && (
                  <div className="super-admin-panel-actions">
                    <button
                      type="button"
                      className="ui-button ui-button-primary ui-button-sm"
                      onClick={openCreateForm}
                    >
                      {openCard === 'pharmacies' ? 'Add pharmacy' : 'Add lab'}
                    </button>
                    <button
                      type="button"
                      className="ui-button ui-button-secondary ui-button-sm"
                      disabled={geocoding}
                      onClick={() => void handleGeocodePartners()}
                    >
                      {geocoding ? 'Updating map…' : 'Fix km distance (save map pins)'}
                    </button>
                  </div>
                )}
              </div>

              <div className="super-admin-panel-body">
                {loading || geocoding ? (
                  <div className="super-admin-skeleton-stack" aria-busy="true" aria-label="Loading records">
                    <Skeleton lines={2} />
                    <Skeleton variant="rect" height={220} />
                  </div>
                ) : (
                  renderCardContent()
                )}
              </div>
            </Card>
          )}
        </section>
      </main>
      {showForm && canAddPartner && renderPartnerForm()}
      {editingDoctorId && (
        <SuperAdminDoctorEditor
          doctorId={editingDoctorId}
          onClose={closeDoctorEditor}
          onSaved={() => void loadAll()}
        />
      )}
    </AppLayout>
  )
}
