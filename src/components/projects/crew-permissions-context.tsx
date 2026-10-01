'use client'

import { createContext, useContext } from 'react'

/**
 * Crew page permissions shared with its modals. What crew are paid follows
 * dealMemos EDIT — without it the server ignores rate fields, so the forms
 * don't offer them.
 */
export const CrewPermissionsContext = createContext({ canSetRates: true })

export function useCrewPermissions() {
  return useContext(CrewPermissionsContext)
}
