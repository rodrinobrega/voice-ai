describe('Upload flow: presigned S3 upload + status polling', () => {
  const transcriptionId = 'tx-1'

  beforeEach(() => {
    cy.intercept('POST', '**/transcriptions/upload-url', {
      transcriptionId,
      uploadUrl: 'https://voice-ai-audio-dev.s3.amazonaws.com/',
      fields: {
        key: `audio/user-123/${transcriptionId}/sample.mp3`,
        policy: 'stub-policy',
        'x-amz-signature': 'stub-signature',
      },
    }).as('getUploadUrl')

    cy.intercept('POST', 'https://voice-ai-audio-dev.s3.amazonaws.com/', {
      statusCode: 204,
    }).as('s3Upload')

    let pollCount = 0
    cy.intercept('GET', `**/transcriptions/${transcriptionId}`, (req) => {
      pollCount += 1
      req.reply({
        transcriptionId,
        userId: 'user-123',
        type: 'FILE',
        status: pollCount < 2 ? 'PROCESSING' : 'COMPLETED',
        sourceFileName: 'sample.mp3',
        language: 'en',
        durationSeconds: 42,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }).as('pollStatus')
  })

  it('uploads a valid audio file and reaches Completed after polling', () => {
    cy.visitAuthenticated('/upload')

    cy.get('[data-testid="file-input"]').selectFile(
      {
        contents: Cypress.Buffer.from('dummy-audio-bytes'),
        fileName: 'sample.mp3',
        mimeType: 'audio/mpeg',
      },
      { force: true },
    )

    cy.get('[data-testid="selected-file-name"]').should('contain', 'sample.mp3')
    cy.contains('button', 'Upload & transcribe').click()

    cy.wait('@getUploadUrl')
    cy.wait('@s3Upload')
    cy.get('[data-testid="processing-status"]').should('be.visible')

    cy.wait('@pollStatus')
    cy.wait('@pollStatus')

    cy.get('[data-testid="upload-result"]', { timeout: 10000 }).should('contain', 'Transcription completed')
  })

  it('rejects an oversized file client-side and never requests an upload URL', () => {
    cy.visitAuthenticated('/upload')

    const oversized = new Uint8Array(21 * 1024 * 1024) // 21MB > 20MB limit
    cy.get('[data-testid="file-input"]').selectFile(
      {
        contents: Cypress.Buffer.from(oversized),
        fileName: 'too-big.mp3',
        mimeType: 'audio/mpeg',
      },
      { force: true },
    )

    cy.get('[data-testid="validation-error"]').should('contain', 'too large')
    cy.get('@getUploadUrl.all').should('have.length', 0)
  })
})
