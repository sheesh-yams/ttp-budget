// Ramp-like look for the shot list only (approved mockup v3): open white page,
// light lines, 4px corners, pills for search / filters / counts. Scoped here so
// the app-wide theme is untouched.

export const SL = {
  ink:   'text-[#1A1A1A]',
  t2:    'text-[#6B6B6B]',
  mut:   'text-[#9A9A9A]',
  line:  'border-[#EEEDEA]',
  line2: 'border-[#E2E0DC]',
  band:  'bg-[#FAF9F7]',
  radius: 'rounded-[4px]',
  btn:   'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-[#E2E0DC] bg-white px-3.5 py-2 text-sm text-[#1A1A1A] hover:bg-[#FAF9F7] disabled:opacity-50',
  btnPrimary: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[4px] border border-primary bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50',
  chip:  'whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] transition-colors',
  chipOn:  'border-[#1A1A1A] text-[#1A1A1A] bg-white',
  chipOff: 'border-[#E2E0DC] text-[#6B6B6B] bg-white hover:border-[#C9C6C0]',
  iconBtn: 'grid h-9 w-9 place-items-center rounded-full border bg-white transition-colors',
  input: 'w-full rounded-[4px] border border-[#E2E0DC] bg-white px-2.5 py-2 text-sm text-[#1A1A1A] placeholder:text-[#9A9A9A] focus:border-[#1A1A1A] focus:outline-none',
  sizeTag: 'inline-block rounded-[3px] bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground',
} as const
