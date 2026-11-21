// Dark mode for the signed-in app — per person (User.themePreference).
// Plain module (jest-tested). Client-facing pages, PDFs and emails never use it.

export const THEME_PREFERENCES = ['LIGHT', 'DARK', 'SYSTEM'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]

export function normalizeTheme(v: unknown): ThemePreference {
  return typeof v === 'string' && (THEME_PREFERENCES as readonly string[]).includes(v) ? (v as ThemePreference) : 'LIGHT'
}

/** Light or dark for a preference, given whether the device prefers dark. */
export function resolveTheme(pref: ThemePreference, deviceDark: boolean): 'light' | 'dark' {
  return pref === 'DARK' || (pref === 'SYSTEM' && deviceDark) ? 'dark' : 'light'
}

/**
 * The inline script the signed-in layout renders: sets <html class="dark">
 * before the page paints (no white flash), and follows the device live for
 * SYSTEM. window.__ssApplyTheme lets the settings toggle switch instantly;
 * window.__ssThemePref reads the current preference (ForceLight restores it).
 */
export function themeScript(pref: ThemePreference): string {
  return `(function(){try{
var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)'),p=${JSON.stringify(normalizeTheme(pref))};
function a(){d.classList.toggle('dark',p==='DARK'||(p==='SYSTEM'&&m.matches));}
window.__ssApplyTheme=function(n){p=n;a();};window.__ssThemePref=function(){return p;};
window.__ssThemeOff=function(){if(m.removeEventListener)m.removeEventListener('change',a);};
a();if(m.addEventListener)m.addEventListener('change',a);
}catch(e){}})();`
}

type ThemeWindow = {
  __ssApplyTheme?: (p: string) => void
  __ssThemePref?: () => string
  __ssThemeOff?: () => void
}

/**
 * The same as the inline script, from React (ThemeController): needed because
 * an inline <script> added during a client-side navigation (sign-in → app)
 * never runs. Takes over from the script's device listener, and returns a
 * cleanup that leaves the page light (signing out, leaving the app).
 */
export function installTheme(pref: ThemePreference): () => void {
  const w = window as unknown as ThemeWindow
  const d = document.documentElement
  const m = window.matchMedia('(prefers-color-scheme: dark)')
  w.__ssThemeOff?.()
  let p: ThemePreference = normalizeTheme(pref)
  const apply = () => { d.classList.toggle('dark', resolveTheme(p, m.matches) === 'dark') }
  w.__ssApplyTheme = n => { p = normalizeTheme(n); apply() }
  w.__ssThemePref = () => p
  w.__ssThemeOff = () => m.removeEventListener?.('change', apply)
  apply()
  m.addEventListener?.('change', apply)
  return () => {
    w.__ssThemeOff?.()
    d.classList.remove('dark')
    delete w.__ssApplyTheme
    delete w.__ssThemePref
    delete w.__ssThemeOff
  }
}
