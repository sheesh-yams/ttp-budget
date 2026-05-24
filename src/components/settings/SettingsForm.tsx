'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  updateCompanySettings,
  updateBrandingSettings,
  updateInvoiceDefaults,
  updateProposalDefaults,
} from '@/server/actions/workspace'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceSettings {
  name:                    string
  legalName:               string | null
  contactEmail:            string | null
  contactPhone:            string | null
  website:                 string | null
  addressLine1:            string | null
  addressLine2:            string | null
  city:                    string | null
  region:                  string | null
  postalCode:              string | null
  country:                 string | null
  logoUrl:                 string | null
  logoDarkUrl:             string | null
  primaryColor:            string
  accentColor:             string
  invoiceNumberPrefix:     string
  defaultPaymentTermsDays: number
  defaultTaxPct:           number  // stored as decimal e.g. 0.08
  wireInstructions:        string | null
  achInstructions:         string | null
  checkPayableTo:          string | null
  checkMailingAddress:     string | null
  defaultInvoiceTerms:     string | null
  defaultProposalTerms:    string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(v: string | null | undefined) { return v ?? '' }

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="mb-1 block">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
    />
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function SaveButton({ state, onClick }: { state: SaveState; onClick: () => void }) {
  return (
    <Button onClick={onClick} disabled={state === 'saving'} size="sm">
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : state === 'error' ? 'Error — retry' : 'Save changes'}
    </Button>
  )
}

function useSave() {
  const [state, setState] = useState<SaveState>('idle')

  async function save(fn: () => Promise<{ success: boolean; error?: string }>) {
    setState('saving')
    const result = await fn()
    if (result.success) {
      setState('saved')
      setTimeout(() => setState('idle'), 2000)
    } else {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return { state, save }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsForm({ workspace }: { workspace: WorkspaceSettings }) {

  // ── Company ────────────────────────────────────────────────────────────────
  const [name, setName]               = useState(str(workspace.name))
  const [legalName, setLegalName]     = useState(str(workspace.legalName))
  const [email, setEmail]             = useState(str(workspace.contactEmail))
  const [phone, setPhone]             = useState(str(workspace.contactPhone))
  const [website, setWebsite]         = useState(str(workspace.website))
  const [addr1, setAddr1]             = useState(str(workspace.addressLine1))
  const [addr2, setAddr2]             = useState(str(workspace.addressLine2))
  const [city, setCity]               = useState(str(workspace.city))
  const [region, setRegion]           = useState(str(workspace.region))
  const [postal, setPostal]           = useState(str(workspace.postalCode))
  const [country, setCountry]         = useState(str(workspace.country))
  const companySave = useSave()

  // ── Branding ───────────────────────────────────────────────────────────────
  const [logoUrl, setLogoUrl]         = useState(str(workspace.logoUrl))
  const [logoDarkUrl, setLogoDarkUrl] = useState(str(workspace.logoDarkUrl))
  const [primaryColor, setPrimary]    = useState(workspace.primaryColor || '#5D00A4')
  const [accentColor, setAccent]      = useState(workspace.accentColor  || '#04FFCC')
  const brandingSave = useSave()

  // ── Invoice defaults ───────────────────────────────────────────────────────
  const [invPrefix, setInvPrefix]     = useState(workspace.invoiceNumberPrefix || 'TTP')
  const [termsDays, setTermsDays]     = useState(String(workspace.defaultPaymentTermsDays ?? 30))
  const [taxPct, setTaxPct]           = useState(String(Number((workspace.defaultTaxPct ?? 0) * 100).toFixed(2)))
  const [wire, setWire]               = useState(str(workspace.wireInstructions))
  const [ach, setAch]                 = useState(str(workspace.achInstructions))
  const [checkTo, setCheckTo]         = useState(str(workspace.checkPayableTo))
  const [checkAddr, setCheckAddr]     = useState(str(workspace.checkMailingAddress))
  const [invTerms, setInvTerms]       = useState(str(workspace.defaultInvoiceTerms))
  const invoiceSave = useSave()

  // ── Proposal defaults ──────────────────────────────────────────────────────
  const [propTerms, setPropTerms]     = useState(str(workspace.defaultProposalTerms))
  const proposalSave = useSave()

  // ── Handlers ───────────────────────────────────────────────────────────────

  function saveCompany() {
    companySave.save(() => updateCompanySettings({
      name, legalName: legalName || null, contactEmail: email || null,
      contactPhone: phone || null, website: website || null,
      addressLine1: addr1 || null, addressLine2: addr2 || null,
      city: city || null, region: region || null,
      postalCode: postal || null, country: country || null,
    }))
  }

  function saveBranding() {
    brandingSave.save(() => updateBrandingSettings({
      logoUrl: logoUrl || null, logoDarkUrl: logoDarkUrl || null,
      primaryColor, accentColor,
    }))
  }

  function saveInvoice() {
    invoiceSave.save(() => updateInvoiceDefaults({
      invoiceNumberPrefix: invPrefix,
      defaultPaymentTermsDays: Number(termsDays) || 30,
      defaultTaxPct: Number(taxPct) || 0,
      wireInstructions: wire || null, achInstructions: ach || null,
      checkPayableTo: checkTo || null, checkMailingAddress: checkAddr || null,
      defaultInvoiceTerms: invTerms || null,
    }))
  }

  function saveProposal() {
    proposalSave.save(() => updateProposalDefaults({
      defaultProposalTerms: propTerms || null,
    }))
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Tabs defaultValue="company">
      <TabsList className="mb-6">
        <TabsTrigger value="company">Company</TabsTrigger>
        <TabsTrigger value="branding">Branding</TabsTrigger>
        <TabsTrigger value="invoices">Invoice defaults</TabsTrigger>
        <TabsTrigger value="proposals">Proposal defaults</TabsTrigger>
      </TabsList>

      {/* ── COMPANY ── */}
      <TabsContent value="company">
        <SettingsCard title="Company info" description="Shown on proposals, invoices, and public pages.">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Display name" hint="Shown at the top of proposals and invoices.">
                <Input value={name} onChange={e => setName(e.target.value)} className="mt-1" />
              </Field>
              <Field label="Legal name" hint='For formal documents — e.g. "The Third Place Creative LLC".'>
                <Input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Optional" className="mt-1" />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Contact email">
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@yourcompany.com" className="mt-1" />
              </Field>
              <Field label="Phone">
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="mt-1" />
              </Field>
            </div>

            <Field label="Website">
              <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourcompany.com" className="mt-1" />
            </Field>

            <div className="pt-1">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mailing address</p>
              <div className="space-y-3">
                <Input value={addr1} onChange={e => setAddr1(e.target.value)} placeholder="Street address" />
                <Input value={addr2} onChange={e => setAddr2(e.target.value)} placeholder="Suite, unit, etc. (optional)" />
                <div className="grid grid-cols-3 gap-3">
                  <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" />
                  <Input value={region} onChange={e => setRegion(e.target.value)} placeholder="State / Province" />
                  <Input value={postal} onChange={e => setPostal(e.target.value)} placeholder="ZIP / Postal" />
                </div>
                <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="Country (e.g. US)" />
              </div>
            </div>
          </div>
          <SaveButton state={companySave.state} onClick={saveCompany} />
        </SettingsCard>
      </TabsContent>

      {/* ── BRANDING ── */}
      <TabsContent value="branding">
        <SettingsCard title="Branding" description="Colors and logos used across proposals, invoices, and PDFs.">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Primary color">
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimary(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-0.5"
                  />
                  <Input
                    value={primaryColor}
                    onChange={e => setPrimary(e.target.value)}
                    placeholder="#5D00A4"
                    className="font-mono"
                  />
                </div>
              </Field>
              <Field label="Accent color">
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={e => setAccent(e.target.value)}
                    className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-0.5"
                  />
                  <Input
                    value={accentColor}
                    onChange={e => setAccent(e.target.value)}
                    placeholder="#04FFCC"
                    className="font-mono"
                  />
                </div>
              </Field>
            </div>

            {/* Live swatch */}
            <div
              className="flex items-center gap-3 rounded-xl p-4 text-sm font-medium"
              style={{ background: primaryColor, color: accentColor }}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-[5px] text-[13px] font-black" style={{ background: accentColor, color: primaryColor }}>
                T
              </div>
              The Third Place Creative — color preview
            </div>

            <div className="border-t pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Logo URLs</p>
              <div className="space-y-4">
                <Field label="Logo (light backgrounds)" hint="Used on the internal app and proposal body.">
                  <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" className="mt-1" />
                </Field>
                <Field label="Logo (dark backgrounds)" hint="Used on proposal/invoice headers and PDFs.">
                  <Input value={logoDarkUrl} onChange={e => setLogoDarkUrl(e.target.value)} placeholder="https://…" className="mt-1" />
                </Field>
              </div>
              {(logoUrl || logoDarkUrl) && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  {logoUrl && (
                    <div className="rounded-lg border bg-white p-4 text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoUrl} alt="Logo light" className="mx-auto max-h-12 object-contain" />
                      <p className="mt-2 text-xs text-muted-foreground">Light</p>
                    </div>
                  )}
                  {logoDarkUrl && (
                    <div className="rounded-lg border p-4 text-center" style={{ background: '#0A0612' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoDarkUrl} alt="Logo dark" className="mx-auto max-h-12 object-contain" />
                      <p className="mt-2 text-xs text-white/40">Dark</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <SaveButton state={brandingSave.state} onClick={saveBranding} />
        </SettingsCard>
      </TabsContent>

      {/* ── INVOICE DEFAULTS ── */}
      <TabsContent value="invoices">
        <div className="space-y-6">
          <SettingsCard title="Numbering & terms" description="Applied when new invoices are created.">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Field label="Invoice prefix" hint='e.g. "TTP" → TTP-2026-001'>
                <Input value={invPrefix} onChange={e => setInvPrefix(e.target.value)} className="mt-1 font-mono" maxLength={20} />
              </Field>
              <Field label="Default payment terms" hint="Days until invoice is due.">
                <div className="mt-1 flex items-center gap-2">
                  <Input type="number" min={0} max={365} value={termsDays} onChange={e => setTermsDays(e.target.value)} className="w-24" />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </Field>
              <Field label="Default tax rate" hint="Applied to new invoices (editable per invoice).">
                <div className="mt-1 flex items-center gap-2">
                  <Input type="number" min={0} max={100} step={0.1} value={taxPct} onChange={e => setTaxPct(e.target.value)} className="w-24" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </Field>
            </div>
            <SaveButton state={invoiceSave.state} onClick={saveInvoice} />
          </SettingsCard>

          <SettingsCard title="Payment instructions" description="Shown on the public invoice page and PDF under 'How to Pay'.">
            <div className="space-y-5">
              <Field label="Wire transfer instructions">
                <TextArea
                  value={wire}
                  onChange={setWire}
                  rows={5}
                  placeholder={"Bank: First National Bank\nABA Routing: 021000021\nAccount #: 123456789\nAccount name: The Third Place Creative LLC"}
                />
              </Field>
              <Field label="ACH / Direct deposit instructions">
                <TextArea
                  value={ach}
                  onChange={setAch}
                  rows={5}
                  placeholder={"Routing #: 021000021\nAccount #: 123456789\nAccount type: Checking"}
                />
              </Field>
              <Field label="Check payable to">
                <Input value={checkTo} onChange={e => setCheckTo(e.target.value)} placeholder="The Third Place Creative LLC" className="mt-1" />
              </Field>
              <Field label="Check mailing address">
                <TextArea value={checkAddr} onChange={setCheckAddr} rows={3} placeholder={"123 Main St\nLos Angeles, CA 90001"} />
              </Field>
            </div>
            <SaveButton state={invoiceSave.state} onClick={saveInvoice} />
          </SettingsCard>

          <SettingsCard title="Default invoice terms" description="Boilerplate terms shown at the bottom of every invoice. Can be edited per invoice.">
            <TextArea
              value={invTerms}
              onChange={setInvTerms}
              rows={8}
              placeholder="Payment is due within 30 days of invoice date. Late payments are subject to a 1.5% monthly interest charge…"
            />
            <SaveButton state={invoiceSave.state} onClick={saveInvoice} />
          </SettingsCard>
        </div>
      </TabsContent>

      {/* ── PROPOSAL DEFAULTS ── */}
      <TabsContent value="proposals">
        <SettingsCard title="Default proposal terms" description="Pre-filled in every new proposal. Editable per proposal.">
          <TextArea
            value={propTerms}
            onChange={setPropTerms}
            rows={10}
            placeholder="This proposal is valid for 30 days from the date of issue. All work is subject to a signed agreement…"
          />
          <SaveButton state={proposalSave.state} onClick={saveProposal} />
        </SettingsCard>
      </TabsContent>
    </Tabs>
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-5 border-b pb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">
        {children}
      </div>
    </div>
  )
}
