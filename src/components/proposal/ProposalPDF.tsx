// Phase 2 — full @react-pdf/renderer implementation lives here.
// Stub keeps the PDF API route compilable.

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { ProposalWithProject } from '@/types'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica' },
  title: { fontSize: 24, marginBottom: 12 },
  body: { fontSize: 12, color: '#555' },
})

export function ProposalPDF({ proposal }: { proposal: ProposalWithProject }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.title}>{proposal.title}</Text>
          <Text style={styles.body}>
            {proposal.project.client.name} — Full PDF renderer builds in Phase 2.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
