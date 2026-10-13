// A crew member's budget line, when an awarded deal memo renamed their role.
//
// Awarding a memo puts the person on the crew under the memo's role
// (`position`, e.g. "Key Grip"), which may differ from the budget line it
// fills (`roleLabel`, e.g. "Lighting Asst"). Code that matches crew to budget
// lines (proposal re-win reconciliation, call sheet "Import from budget")
// counts them as that budget line — but only while their role is still the
// memo's: someone moved to another role by hand counts as that role.

export interface AwardedMemoRole { contactId: string | null; roleLabel: string; position: string }

export function budgetRoleFor(member: { contactId?: string | null; role: string }, memos: AwardedMemoRole[]): string {
  if (!member.contactId) return member.role
  const memo = memos.find(m => m.contactId === member.contactId && (m.position.trim() || m.roleLabel) === member.role)
  return memo ? memo.roleLabel : member.role
}
