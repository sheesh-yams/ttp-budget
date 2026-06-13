'use client'

/**
 * PreviewPanel — slide-in right drawer with an authenticated invoice preview.
 *
 * Usage:
 *   <PreviewPanel invoiceId={inv.id} trigger={<button>Preview</button>} />
 *
 * The panel iframes /invoices/preview/[id], which renders InvoicePublicView
 * for any invoice status (including DRAFT) inside the auth layout.
 */

import { useState, useEffect } from 'react'
import { X, Eye } from 'lucide-react'

interface PreviewPanelProps {
  invoiceId: string
  invoiceNumber?: string
  trigger?: React.ReactNode
}

export function PreviewPanel({ invoiceId, invoiceNumber, trigger }: PreviewPanelProps) {
  const [open, setOpen] = useState(false)

  // Prevent body scroll while panel is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Trigger */}
      <span onClick={() => setOpen(true)} style={{ display: 'contents', cursor: 'pointer' }}>
        {trigger ?? (
          <button
            type="button"
            title="Preview invoice"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </span>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 1000,
          }}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(780px, 92vw)',
          background: '#fff',
          zIndex: 1001,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #E8E3EF',
          flexShrink: 0,
          background: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Eye style={{ width: 15, height: 15, color: '#5D00A4' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0612' }}>
              Invoice Preview
              {invoiceNumber && (
                <span style={{ fontWeight: 400, color: '#888', marginLeft: 6, fontFamily: 'monospace', fontSize: 12 }}>
                  {invoiceNumber}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#888',
            }}
            title="Close preview"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* iframe — only mounted while open to avoid needless network requests */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {open && (
            <iframe
              src={`/invoices/preview/${invoiceId}`}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="Invoice preview"
            />
          )}
        </div>
      </div>
    </>
  )
}
