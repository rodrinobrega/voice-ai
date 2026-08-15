interface StubTranscription {
  transcriptionId: string
  userId: string
  type: 'FILE'
  status: 'COMPLETED'
  sourceFileName: string
  createdAt: string
  updatedAt: string
}

function makeItem(index: number): StubTranscription {
  const createdAt = new Date(2026, 0, index).toISOString()
  return {
    transcriptionId: `tx-${index}`,
    userId: 'user-123',
    type: 'FILE',
    status: 'COMPLETED',
    sourceFileName: `recording-${index}.mp3`,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('History: pagination (cursor stack) and download', () => {
  const page1Items = Array.from({ length: 10 }, (_, i) => makeItem(i + 1))
  const page2Items = Array.from({ length: 2 }, (_, i) => makeItem(i + 11))

  beforeEach(() => {
    cy.intercept('GET', '**/transcriptions*', (req) => {
      if (!req.query.cursor) {
        req.reply({ items: page1Items, nextCursor: 'cursor-page-2' })
      } else if (req.query.cursor === 'cursor-page-2') {
        req.reply({ items: page2Items, nextCursor: null })
      }
    }).as('listTranscriptions')

    cy.intercept('GET', '**/transcriptions/tx-1/download', {
      downloadUrl: 'https://voice-ai-transcripts-dev.s3.amazonaws.com/user-123/tx-1.txt?signed=1',
    }).as('download')
  })

  it('shows 10 items per page, paginates forward and back, and downloads a row', () => {
    cy.visitAuthenticated('/history')
    cy.wait('@listTranscriptions')

    cy.get('[data-testid="transcription-row"]').should('have.length', 10)
    cy.get('[data-testid="pagination-previous"]').should('be.disabled')
    cy.get('[data-testid="pagination-next"]').should('not.be.disabled')

    cy.get('[data-testid="pagination-next"]').click()
    cy.wait('@listTranscriptions')
    cy.get('[data-testid="transcription-row"]').should('have.length', 2)
    cy.get('[data-testid="pagination-next"]').should('be.disabled')
    cy.get('[data-testid="pagination-previous"]').should('not.be.disabled')

    cy.get('[data-testid="pagination-previous"]').click()
    cy.wait('@listTranscriptions')
    cy.get('[data-testid="transcription-row"]').should('have.length', 10)
    cy.get('[data-testid="pagination-previous"]').should('be.disabled')

    cy.get('[data-testid="download-button"]').first().click()
    cy.wait('@download')
  })
})
