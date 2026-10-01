'use client'

import { createContext, useContext } from 'react'

/**
 * What the budget editor may show, from the viewer's project permissions
 * (budget.costs / budget.margin). The server has already stripped the data
 * itself (stripBudgetForAccess); this only stops the UI drawing empty money
 * columns and inputs that would be ignored.
 */
export const BudgetVisibilityContext = createContext({
  showCosts:        true,
  showMargin:       true,
  /** Insert package — budget.costs EDIT + the package library */
  canInsertPackage: true,
  /** Import file — budget.costs EDIT */
  canImport:        true,
})

export function useBudgetVisibility() {
  return useContext(BudgetVisibilityContext)
}
