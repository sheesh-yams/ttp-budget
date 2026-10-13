// The personal call sheet email (one per person). Pure rendering — no Resend
// here, so it can be previewed and tested; sendCallSheetBatch in
// src/lib/email.ts sends what this builds.
//
// Kept out on purpose: dietary info and anyone else's contact details.

export interface CallSheetEmailInput {
  firstName: string
  /** "Gaffer", "Host"… */
  role: string | null
  /** Already formatted ("7:30 AM"); null for people without their own call. */
  callTime: string | null
  generalCall: string            // formatted
  projectName: string
  dateLabel: string              // "Tuesday, October 13"
  dayLabel: string | null        // "Day 1" when known
  locationName: string | null
  locationAddress: string | null
  parkingAddress: string | null
  weather: string | null         // "Sunny · 72° / 58° · 10% rain"
  hospital: { name: string; address: string; phone?: string } | null
  /** First few blocks, times already formatted. */
  schedule: { time: string; label: string }[]
  moreBlocks: number
  note: string | null
  /** For an update: what changed since their last email. */
  changes: string[]
  isUpdate: boolean
  viewUrl: string
  confirmUrl: string
  senderName: string | null
  brandName: string
  primary: string
  accent: string
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const mapUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

export function callSheetSubject(p: Pick<CallSheetEmailInput, 'isUpdate' | 'projectName' | 'dayLabel' | 'dateLabel'>): string {
  const when = [p.dayLabel, p.dateLabel].filter(Boolean).join(', ')
  return `${p.isUpdate ? 'Updated call sheet' : 'Call sheet'}: ${p.projectName} — ${when}`
}

export function renderCallSheetEmail(p: CallSheetEmailInput): { subject: string; html: string; text: string } {
  const subject = callSheetSubject(p)
  const yourCall = p.callTime ?? p.generalCall
  const callLabel = p.callTime ? 'Your call' : 'General call'
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:6px 0;width:110px;vertical-align:top;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#8a8494">${esc(label)}</td>
      <td style="padding:6px 0;font-size:14px;color:#1a1424;line-height:1.5">${value}</td>
    </tr>`

  const details = [
    row('Date', esc([p.dayLabel, p.dateLabel].filter(Boolean).join(' · '))),
    p.callTime ? row('General call', esc(p.generalCall)) : '',
    p.locationName || p.locationAddress ? row('Location', [
      p.locationName ? `<strong>${esc(p.locationName)}</strong>` : '',
      p.locationAddress ? `<a href="${esc(mapUrl(p.locationAddress))}" style="color:${p.primary}">${esc(p.locationAddress)}</a>` : '',
    ].filter(Boolean).join('<br>')) : '',
    p.parkingAddress ? row('Parking', `<a href="${esc(mapUrl(p.parkingAddress))}" style="color:${p.primary}">${esc(p.parkingAddress)}</a>`) : '',
    p.weather ? row('Weather', esc(p.weather)) : '',
    p.hospital ? row('Hospital', `${esc(p.hospital.name)}<br><span style="color:#6b6475">${esc(p.hospital.address)}${p.hospital.phone ? ` · ${esc(p.hospital.phone)}` : ''}</span>`) : '',
  ].join('')

  const schedule = p.schedule.length ? `
    <p style="margin:24px 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a8494">Schedule</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee">
      ${p.schedule.map(b => `<tr>
        <td style="padding:7px 12px 7px 0;width:80px;border-bottom:1px solid #eee;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#1a1424;white-space:nowrap">${esc(b.time)}</td>
        <td style="padding:7px 0;border-bottom:1px solid #eee;font-size:14px;color:#1a1424">${esc(b.label)}</td>
      </tr>`).join('')}
    </table>
    ${p.moreBlocks > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:#8a8494">+ ${p.moreBlocks} more on the full call sheet</p>` : ''}` : ''

  const changes = p.isUpdate && p.changes.length ? `
    <div style="margin:0 0 20px;padding:12px 16px;border-radius:8px;background:#FFF7E6;border:1px solid #F5D9A0">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#8a5a00">What changed</p>
      ${p.changes.map(c => `<p style="margin:2px 0;font-size:14px;color:#5c3d00">• ${esc(c)}</p>`).join('')}
    </div>` : ''

  const note = p.note?.trim() ? `
    <div style="margin:20px 0 0;padding:12px 16px;border-left:3px solid ${p.primary};background:#F7F4FA">
      <p style="margin:0;font-size:14px;color:#1a1424;line-height:1.6;white-space:pre-line">${esc(p.note.trim())}</p>
      ${p.senderName ? `<p style="margin:6px 0 0;font-size:12px;color:#8a8494">— ${esc(p.senderName)}</p>` : ''}
    </div>` : ''

  const btn = (url: string, label: string, solid: boolean) => `<a href="${esc(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;${solid
    ? `background:${p.primary};color:#ffffff;border:1px solid ${p.primary}` : `background:#ffffff;color:${p.primary};border:1px solid ${p.primary}`}">${esc(label)}</a>`

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F7F4FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F4FA;padding:24px 12px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E8E3EF">
        <tr><td style="background:#0A0612;padding:20px 28px">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${p.accent}">${esc(p.brandName)}</p>
        </td></tr>
        <tr><td style="background:${p.primary};padding:12px 28px">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.75)">${p.isUpdate ? 'Updated call sheet' : 'Call sheet'}</p>
          <p style="margin:4px 0 0;font-size:19px;font-weight:700;color:#fff">${esc(p.projectName)}</p>
        </td></tr>
        <tr><td style="padding:24px 28px 28px">
          ${changes}
          <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#0A0612">Hi ${esc(p.firstName || 'there')},</p>
          <div style="margin:14px 0 20px;padding:16px 18px;border-radius:10px;background:#F7F4FA;border:1px solid #E8E3EF">
            <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#8a8494">${callLabel}</p>
            <p style="margin:2px 0 0;font-size:28px;font-weight:800;color:#0A0612">${esc(yourCall)}</p>
            ${p.role ? `<p style="margin:2px 0 0;font-size:14px;color:#6b6475">${esc(p.role)}</p>` : ''}
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">${details}</table>
          ${schedule}
          ${note}
          <div style="margin:26px 0 0">
            ${btn(p.confirmUrl, 'Confirm I’ll be there', true)}
            ${btn(p.viewUrl, 'View full call sheet', false)}
          </div>
          <p style="margin:14px 0 0;font-size:12px;color:#aaa">This link is just for you. Replying to this email reaches ${esc(p.senderName || p.brandName)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    p.isUpdate ? `UPDATED CALL SHEET — ${p.projectName}` : `CALL SHEET — ${p.projectName}`,
    '',
    ...(p.isUpdate && p.changes.length ? ['What changed:', ...p.changes.map(c => `  • ${c}`), ''] : []),
    `Hi ${p.firstName || 'there'},`,
    `${callLabel}: ${yourCall}${p.role ? ` (${p.role})` : ''}`,
    `Date: ${[p.dayLabel, p.dateLabel].filter(Boolean).join(' · ')}`,
    ...(p.callTime ? [`General call: ${p.generalCall}`] : []),
    ...(p.locationName || p.locationAddress ? [`Location: ${[p.locationName, p.locationAddress].filter(Boolean).join(' — ')}`] : []),
    ...(p.parkingAddress ? [`Parking: ${p.parkingAddress}`] : []),
    ...(p.weather ? [`Weather: ${p.weather}`] : []),
    ...(p.hospital ? [`Hospital: ${p.hospital.name}, ${p.hospital.address}${p.hospital.phone ? ` (${p.hospital.phone})` : ''}`] : []),
    ...(p.schedule.length ? ['', 'Schedule:', ...p.schedule.map(b => `  ${b.time}  ${b.label}`), ...(p.moreBlocks ? [`  + ${p.moreBlocks} more`] : [])] : []),
    ...(p.note?.trim() ? ['', p.note.trim(), ...(p.senderName ? [`— ${p.senderName}`] : [])] : []),
    '',
    `Confirm you'll be there: ${p.confirmUrl}`,
    `Full call sheet: ${p.viewUrl}`,
  ].join('\n')

  return { subject, html, text }
}
