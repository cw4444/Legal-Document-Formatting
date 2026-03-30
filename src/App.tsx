import JSZip from 'jszip'
import type { Session } from '@supabase/supabase-js'
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { processDocx } from './docxProcessor'
import { DEFAULT_STYLE_PROFILE, HOUSE_STYLE_PROFILES } from './styleProfiles'
import type {
  AnalysisResult,
  BatchDocumentRecord,
  BatchRunRecord,
  HouseStyleProfile,
} from './types'
import { downloadBlob, formatNumber, getErrorMessage, pluralize } from './utils'

const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

const AUTOMATION_STEPS = [
  'Read every Word XML content part inside each .docx archive.',
  'Apply a named house style profile plus footer/header watch terms.',
  'Normalize repetitive cleanup work automatically across the batch.',
  'Persist artifacts and drilldown history behind signed-in Supabase access.',
]

const CAPABILITIES = [
  { title: 'Batch intake', description: 'Upload one brief or a whole night-shift queue and process them in one pass.' },
  { title: 'House style checks', description: 'Run the queue against a legal document profile with preferred fonts, sizes, and footer hygiene rules.' },
  { title: 'Signed-in safety', description: 'Supabase-backed features are now scoped to the authenticated user and private storage paths.' },
]

function buildBatchSummary(results: AnalysisResult[]) {
  const totals = results.reduce(
    (accumulator, result) => {
      accumulator.files += 1
      accumulator.parts += result.processedParts.length
      accumulator.issues += result.issues.length
      accumulator.critical += result.issues.filter((issue) => issue.severity === 'critical').length
      accumulator.autoFixes +=
        result.summary.doubleSpacesFixed +
        result.summary.tabsNormalized +
        result.summary.trailingWhitespaceFixed +
        result.summary.blankParagraphsCollapsed
      return accumulator
    },
    { files: 0, parts: 0, issues: 0, critical: 0, autoFixes: 0 },
  )

  return [
    'Batch Summary',
    '=============',
    '',
    `Files processed: ${totals.files}`,
    `Word parts processed: ${totals.parts}`,
    `Auto-fixes applied: ${totals.autoFixes}`,
    `Issues logged: ${totals.issues}`,
    `Critical checks: ${totals.critical}`,
    '',
    'Documents',
    '---------',
    ...results.map(
      (result) =>
        `${result.sourceFileName} | profile: ${result.appliedProfileName} | watch hits: ${
          result.watchTermsFound.join(', ') || 'none'
        } | issues: ${result.issues.length}`,
    ),
    '',
  ].join('\n')
}

async function buildBatchBundle(results: AnalysisResult[]) {
  const zip = new JSZip()

  for (const result of results) {
    zip.file(result.cleanedFileName, await result.cleanedBlob.arrayBuffer())
    zip.file(result.reportFileName, await result.reportBlob.text())
  }

  zip.file('batch-summary.txt', buildBatchSummary(results))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function splitLines(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function App() {
  const [results, setResults] = useState<AnalysisResult[]>([])
  const deferredResults = useDeferredValue(results)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [queueLabel, setQueueLabel] = useState('No documents loaded yet.')
  const [selectedProfileId, setSelectedProfileId] = useState(DEFAULT_STYLE_PROFILE.id)
  const [watchTermsText, setWatchTermsText] = useState('February client\nOld matter number')
  const [profileNameInput, setProfileNameInput] = useState(DEFAULT_STYLE_PROFILE.name)
  const [profileDescriptionInput, setProfileDescriptionInput] = useState(DEFAULT_STYLE_PROFILE.description)
  const [fontInput, setFontInput] = useState(DEFAULT_STYLE_PROFILE.preferredFonts.join('\n'))
  const [sizeInput, setSizeInput] = useState(DEFAULT_STYLE_PROFILE.preferredSizes.join('\n'))
  const [profileWatchTermsInput, setProfileWatchTermsInput] = useState(DEFAULT_STYLE_PROFILE.footerWatchTerms.join('\n'))
  const [remoteProfiles, setRemoteProfiles] = useState<HouseStyleProfile[]>([])
  const [recentRuns, setRecentRuns] = useState<BatchRunRecord[]>([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [selectedRunDocuments, setSelectedRunDocuments] = useState<BatchDocumentRecord[]>([])
  const [loadingRemoteData, setLoadingRemoteData] = useState(false)
  const [loadingRunDocuments, setLoadingRunDocuments] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authEmail, setAuthEmail] = useState('')

  const availableProfiles = useMemo(() => {
    const merged = [...HOUSE_STYLE_PROFILES, ...remoteProfiles]
    const seen = new Set<string>()
    return merged.filter((profile) => {
      if (seen.has(profile.id)) return false
      seen.add(profile.id)
      return true
    })
  }, [remoteProfiles])

  const selectedProfile =
    availableProfiles.find((profile) => profile.id === selectedProfileId) ?? DEFAULT_STYLE_PROFILE

  const selectedRun = recentRuns.find((run) => run.id === selectedRunId) ?? null
  const remoteReady = isSupabaseConfigured && Boolean(session)

  useEffect(() => {
    setProfileNameInput(selectedProfile.name)
    setProfileDescriptionInput(selectedProfile.description)
    setFontInput(selectedProfile.preferredFonts.join('\n'))
    setSizeInput(selectedProfile.preferredSizes.join('\n'))
    setProfileWatchTermsInput(selectedProfile.footerWatchTerms.join('\n'))
  }, [selectedProfile])

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false
    let unsubscribe = () => {}

    async function bootstrapAuth() {
      const authModule = await import('./supabaseAuth')
      const currentSession = await authModule.getCurrentSession()
      if (!cancelled) {
        setSession(currentSession)
        setAuthEmail(currentSession?.user.email ?? '')
      }
      const subscription = authModule.onSupabaseAuthChange((nextSession) => {
        if (!cancelled) {
          setSession(nextSession)
          setAuthEmail(nextSession?.user.email ?? authEmail)
        }
      })
      unsubscribe = () => subscription.unsubscribe()
    }

    void bootstrapAuth()
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!remoteReady) {
      setRemoteProfiles([])
      setRecentRuns([])
      setSelectedRunDocuments([])
      return
    }

    let cancelled = false

    async function loadRemoteData() {
      setLoadingRemoteData(true)
      try {
        const dataModule = await import('./supabaseData')
        const [profiles, runs] = await Promise.all([dataModule.fetchSupabaseProfiles(), dataModule.fetchBatchRuns()])
        if (!cancelled) {
          setRemoteProfiles(profiles)
          setRecentRuns(runs)
          if (runs[0]) setSelectedRunId(runs[0].id)
        }
      } catch (caughtError) {
        if (!cancelled) setNotice(getErrorMessage(caughtError, 'Unable to load Supabase data.'))
      } finally {
        if (!cancelled) setLoadingRemoteData(false)
      }
    }

    void loadRemoteData()
    return () => {
      cancelled = true
    }
  }, [remoteReady])

  useEffect(() => {
    if (!remoteReady || !selectedRunId) {
      setSelectedRunDocuments([])
      return
    }

    let cancelled = false

    async function loadRunDocuments() {
      setLoadingRunDocuments(true)
      try {
        const dataModule = await import('./supabaseData')
        const documents = await dataModule.fetchBatchDocuments(selectedRunId)
        if (!cancelled) setSelectedRunDocuments(documents)
      } catch (caughtError) {
        if (!cancelled) setNotice(getErrorMessage(caughtError, 'Unable to load batch documents.'))
      } finally {
        if (!cancelled) setLoadingRunDocuments(false)
      }
    }

    void loadRunDocuments()
    return () => {
      cancelled = true
    }
  }, [remoteReady, selectedRunId])

  async function openSignedStorageUrl(path: string) {
    try {
      const dataModule = await import('./supabaseData')
      const signedUrl = await dataModule.getStorageSignedUrl(path)
      window.open(signedUrl, '_blank', 'noopener,noreferrer')
    } catch (caughtError) {
      setNotice(getErrorMessage(caughtError, 'Unable to open stored file.'))
    }
  }

  async function handleSignIn() {
    if (!authEmail.trim()) {
      setNotice('Enter the email address tied to your Supabase project auth user.')
      return
    }

    try {
      const authModule = await import('./supabaseAuth')
      await authModule.signInWithMagicLink(authEmail.trim())
      setNotice('Magic link sent. Open it, then come back here once the session is active.')
    } catch (caughtError) {
      setNotice(getErrorMessage(caughtError, 'Unable to send magic link.'))
    }
  }

  async function handleSignOut() {
    try {
      const authModule = await import('./supabaseAuth')
      await authModule.signOutSupabase()
      setNotice('Signed out of Supabase.')
      setRecentRuns([])
      setSelectedRunDocuments([])
    } catch (caughtError) {
      setNotice(getErrorMessage(caughtError, 'Unable to sign out.'))
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    if (files.some((file) => !file.name.toLowerCase().endsWith('.docx'))) {
      setStatus('error')
      setError('This prototype currently expects only .docx files in the queue.')
      setResults([])
      return
    }

    setStatus('working')
    setError('')
    setNotice('')
    setQueueLabel(files.length === 1 ? files[0].name : `${files.length} documents queued for cleanup`)

    const watchTerms = splitLines(watchTermsText)

    try {
      const nextResults: AnalysisResult[] = []
      for (const file of files) {
        nextResults.push(await processDocx(file, { profile: selectedProfile, watchTerms }))
      }

      startTransition(() => {
        setResults(nextResults)
        setStatus('done')
      })

      if (remoteReady) {
        const dataModule = await import('./supabaseData')
        const saved = await dataModule.saveBatchRun(nextResults, watchTerms)
        setRecentRuns((current) => [saved.run, ...current].slice(0, 8))
        setSelectedRunId(saved.run.id)
        setSelectedRunDocuments(saved.documents)
        setNotice('Batch run, cleaned documents, reports, and batch zip saved to Supabase.')
      } else if (isSupabaseConfigured) {
        setNotice('Processed locally. Sign in to save runs, profiles, and generated files to Supabase.')
      } else {
        setNotice('Processed locally. Add Supabase env vars to unlock remote profiles, storage, and history.')
      }
    } catch (caughtError) {
      setStatus('error')
      setError(getErrorMessage(caughtError, 'Unknown processing failure.'))
      setResults([])
    } finally {
      event.target.value = ''
    }
  }

  async function handleSaveProfile() {
    setNotice('')
    const profileToSave: HouseStyleProfile = {
      id: slugify(profileNameInput) || `profile-${Date.now()}`,
      name: profileNameInput.trim() || 'Untitled Profile',
      description: profileDescriptionInput.trim(),
      preferredFonts: splitLines(fontInput),
      preferredSizes: splitLines(sizeInput),
      footerWatchTerms: splitLines(profileWatchTermsInput),
      source: 'remote',
    }

    if (!remoteReady) {
      setNotice(
        isSupabaseConfigured
          ? 'Sign in first to save profiles into Supabase.'
          : 'Supabase is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.',
      )
      return
    }

    try {
      const dataModule = await import('./supabaseData')
      const savedProfile = await dataModule.saveSupabaseProfile(profileToSave)
      setRemoteProfiles((current) => [savedProfile, ...current.filter((profile) => profile.id !== savedProfile.id)])
      setSelectedProfileId(savedProfile.id)
      setNotice(`Saved "${savedProfile.name}" to Supabase.`)
    } catch (caughtError) {
      setNotice(getErrorMessage(caughtError, 'Unable to save profile.'))
    }
  }

  const totals = deferredResults.reduce(
    (accumulator, result) => {
      accumulator.files += 1
      accumulator.parts += result.processedParts.length
      accumulator.issues += result.issues.length
      accumulator.critical += result.issues.filter((issue) => issue.severity === 'critical').length
      accumulator.watchHits += result.watchTermsFound.length
      accumulator.autoFixes +=
        result.summary.doubleSpacesFixed +
        result.summary.tabsNormalized +
        result.summary.trailingWhitespaceFixed +
        result.summary.blankParagraphsCollapsed
      return accumulator
    },
    { files: 0, parts: 0, issues: 0, critical: 0, autoFixes: 0, watchHits: 0 },
  )

  const latestResult = deferredResults[0] ?? null

  async function downloadBundle() {
    const bundle = await buildBatchBundle(deferredResults)
    downloadBlob(bundle, 'document-production-batch.zip')
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Document Production Automation</p>
          <h1>Give the Word-nightmare a memory and a safer backend.</h1>
          <p className="lede">
            Run legal documents against named production profiles, catch stale footer details, and persist house
            styles, batch history, and generated files behind signed-in Supabase access.
          </p>
          <div className="hero-actions">
            <label className="upload-button">
              <input type="file" accept=".docx" multiple onChange={handleFileChange} />
              Upload one or many .docx files
            </label>
            <span className="status-chip" data-state={status}>
              {status === 'idle' && 'Waiting for a queue'}
              {status === 'working' && 'Processing batch'}
              {status === 'done' && 'Bundle ready'}
              {status === 'error' && 'Needs attention'}
            </span>
          </div>
          <p className="supabase-state">
            Supabase: {isSupabaseConfigured ? (remoteReady ? 'configured and signed in' : 'configured, sign-in needed') : 'not configured'}
            {loadingRemoteData ? ' | loading remote data' : ''}
          </p>
          {isSupabaseConfigured ? (
            <div className="auth-row">
              <input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="name@firm.com"
              />
              {remoteReady ? (
                <button type="button" className="secondary" onClick={handleSignOut}>
                  Sign out
                </button>
              ) : (
                <button type="button" className="secondary" onClick={handleSignIn}>
                  Email magic link
                </button>
              )}
            </div>
          ) : null}
        </div>

        <div className="hero-steps" aria-hidden="true">
          <div className="visual-grid">
            {AUTOMATION_STEPS.map((step, index) => (
              <div key={step} className="step-line" style={{ animationDelay: `${index * 120}ms` }}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-strip">
        {CAPABILITIES.map((capability) => (
          <article key={capability.title}>
            <h2>{capability.title}</h2>
            <p>{capability.description}</p>
          </article>
        ))}
      </section>

      <section className="workspace">
        <div className="workspace-header">
          <div>
            <p className="eyebrow">Production Console</p>
            <h2>{queueLabel}</h2>
          </div>
          {deferredResults.length > 0 ? (
            <div className="download-group">
              {deferredResults.length > 1 ? (
                <button type="button" onClick={downloadBundle}>
                  Download batch zip
                </button>
              ) : null}
              <button type="button" onClick={() => downloadBlob(deferredResults[0].cleanedBlob, deferredResults[0].cleanedFileName)}>
                Download first cleaned .docx
              </button>
              <button type="button" className="secondary" onClick={() => downloadBlob(deferredResults[0].reportBlob, deferredResults[0].reportFileName)}>
                Download first report
              </button>
            </div>
          ) : null}
        </div>

        {notice ? <p className="notice-banner">{notice}</p> : null}
        {status === 'error' ? <p className="error-banner">{error}</p> : null}

        <div className="workspace-grid">
          <article className="summary-panel">
            <div className="panel-title">
              <h3>Profile studio</h3>
              <p>Select a profile, tweak it, and save it into Supabase for the next run.</p>
            </div>
            <div className="controls-stack">
              <label className="control-field">
                <span>Available profiles</span>
                <select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
                  {availableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} {profile.source === 'remote' ? '(Supabase)' : '(Local)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-field">
                <span>Profile name</span>
                <input value={profileNameInput} onChange={(event) => setProfileNameInput(event.target.value)} />
              </label>
              <label className="control-field">
                <span>Description</span>
                <textarea value={profileDescriptionInput} onChange={(event) => setProfileDescriptionInput(event.target.value)} rows={3} />
              </label>
              <label className="control-field">
                <span>Preferred fonts</span>
                <textarea value={fontInput} onChange={(event) => setFontInput(event.target.value)} rows={4} />
              </label>
              <label className="control-field">
                <span>Preferred sizes (half-points)</span>
                <textarea value={sizeInput} onChange={(event) => setSizeInput(event.target.value)} rows={4} />
              </label>
              <label className="control-field">
                <span>Default footer watch terms</span>
                <textarea value={profileWatchTermsInput} onChange={(event) => setProfileWatchTermsInput(event.target.value)} rows={4} />
              </label>
              <div className="card-actions">
                <button type="button" onClick={handleSaveProfile}>
                  Save profile to Supabase
                </button>
              </div>
            </div>
          </article>

          <article className="issues-panel">
            <div className="panel-title">
              <h3>Run controls</h3>
              <p>Batch cleanup, watchlist overrides, and the current queue totals.</p>
            </div>
            <div className="controls-stack">
              <p className="empty-copy">{selectedProfile.description}</p>
              <div className="pill-row">
                {selectedProfile.preferredFonts.map((font) => (
                  <span key={font} className="pill">
                    {font}
                  </span>
                ))}
                {selectedProfile.preferredSizes.map((size) => (
                  <span key={size} className="pill">
                    {size} hp
                  </span>
                ))}
              </div>
              <label className="control-field">
                <span>Header/footer watchlist overrides</span>
                <textarea
                  value={watchTermsText}
                  onChange={(event) => setWatchTermsText(event.target.value)}
                  rows={5}
                  placeholder="One term per line, such as client names, matter numbers, or old footer phrases"
                />
              </label>
              {deferredResults.length > 0 ? (
                <>
                  <div className="metric-row">
                    <div>
                      <strong>{formatNumber(totals.files)}</strong>
                      <span>{pluralize(totals.files, 'document')} processed</span>
                    </div>
                    <div>
                      <strong>{formatNumber(totals.autoFixes)}</strong>
                      <span>auto-fixes applied</span>
                    </div>
                    <div>
                      <strong>{formatNumber(totals.critical)}</strong>
                      <span>critical checks</span>
                    </div>
                  </div>

                  <ul className="stats-list">
                    <li>
                      <span>Watchlist hits</span>
                      <strong>{formatNumber(totals.watchHits)}</strong>
                    </li>
                    <li>
                      <span>Word parts swept</span>
                      <strong>{formatNumber(totals.parts)}</strong>
                    </li>
                    <li>
                      <span>Issues logged</span>
                      <strong>{formatNumber(totals.issues)}</strong>
                    </li>
                    <li>
                      <span>Active profile</span>
                      <strong>{selectedProfile.name}</strong>
                    </li>
                  </ul>
                </>
              ) : (
                <p className="empty-copy">
                  Process a queue to see totals here. With Supabase configured and signed in, each completed run is
                  stored with private generated files and visible in the history panel.
                </p>
              )}
            </div>
          </article>
        </div>

        <div className="workspace-grid workspace-grid-lower">
          <article className="preview-panel">
            <div className="panel-title">
              <h3>Queue results</h3>
              <p>Each document gets its own cleanup output, report, profile match status, and watchlist result.</p>
            </div>
            {deferredResults.length > 0 ? (
              <div className="issue-list">
                {deferredResults.map((result) => {
                  const criticalCount = result.issues.filter((issue) => issue.severity === 'critical').length
                  const fixCount =
                    result.summary.doubleSpacesFixed +
                    result.summary.tabsNormalized +
                    result.summary.trailingWhitespaceFixed +
                    result.summary.blankParagraphsCollapsed

                  return (
                    <article key={result.cleanedFileName} className="issue-card">
                      <div className="issue-header issue-header-stack">
                        <strong>{result.sourceFileName}</strong>
                        <span>{result.appliedProfileName}</span>
                      </div>
                      <p>
                        {formatNumber(fixCount)} auto-fixes, {formatNumber(result.issues.length)} issues, {formatNumber(criticalCount)} critical.
                      </p>
                      <div className="issue-meta issue-meta-stack">
                        <span>{result.processedParts.join(', ')}</span>
                        <span>Watch hits: {result.watchTermsFound.join(', ') || 'none'}</span>
                      </div>
                      <div className="card-actions">
                        <button type="button" className="secondary" onClick={() => downloadBlob(result.cleanedBlob, result.cleanedFileName)}>
                          Cleaned docx
                        </button>
                        <button type="button" className="secondary" onClick={() => downloadBlob(result.reportBlob, result.reportFileName)}>
                          Report
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="empty-copy">The queue list will populate here after processing.</p>
            )}
          </article>

          <article className="styles-panel">
            <div className="panel-title">
              <h3>Supabase batch history</h3>
              <p>Recent shared runs, with drilldown into individual document records and signed links to stored artifacts.</p>
            </div>
            {recentRuns.length > 0 ? (
              <>
                <label className="control-field">
                  <span>Recent runs</span>
                  <select value={selectedRunId} onChange={(event) => setSelectedRunId(event.target.value)}>
                    {recentRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {new Date(run.createdAt).toLocaleString('en-GB')} | {run.profileName}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedRun ? (
                  <div className="history-actions">
                    <p className="empty-copy">
                      {selectedRun.filesProcessed} files, {selectedRun.issuesLogged} issues, {selectedRun.criticalChecks} critical, {selectedRun.watchHits} watch hits.
                    </p>
                    {selectedRun.bundleStoragePath ? (
                      <button type="button" className="secondary" onClick={() => openSignedStorageUrl(selectedRun.bundleStoragePath!)}>
                        Open stored batch zip
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {loadingRunDocuments ? (
                  <p className="empty-copy">Loading run documents...</p>
                ) : selectedRunDocuments.length > 0 ? (
                  <div className="history-documents">
                    {selectedRunDocuments.map((document) => (
                      <article key={document.id} className="issue-card">
                        <div className="issue-header issue-header-stack">
                          <strong>{document.sourceFileName}</strong>
                          <span>{document.appliedProfileName}</span>
                        </div>
                        <p>
                          {document.issueCount} issues, {document.criticalCount} critical, watch hits: {document.watchTermsFound.join(', ') || 'none'}.
                        </p>
                        <div className="issue-meta issue-meta-stack">
                          <span>{document.processedParts.join(', ')}</span>
                          <span>{document.preview[0] ?? 'No preview available.'}</span>
                        </div>
                        <div className="card-actions">
                          {document.cleanedDocStoragePath ? (
                            <button type="button" className="secondary" onClick={() => openSignedStorageUrl(document.cleanedDocStoragePath!)}>
                              Open cleaned docx
                            </button>
                          ) : null}
                          {document.reportStoragePath ? (
                            <button type="button" className="secondary" onClick={() => openSignedStorageUrl(document.reportStoragePath!)}>
                              Open report
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">
                    {remoteReady
                      ? 'No document drilldown found for this run yet.'
                      : isSupabaseConfigured
                        ? 'Sign in to browse remote batch history and stored files.'
                        : 'Set your Supabase env vars and run the SQL migrations to unlock shared history and stored files.'}
                  </p>
                )}
              </>
            ) : (
              <p className="empty-copy">
                {remoteReady
                  ? 'No remote batch history yet. The next successful run should show up here.'
                  : isSupabaseConfigured
                    ? 'Sign in to Supabase to unlock remote profiles, storage, and batch history.'
                    : 'Set your Supabase env vars and run the SQL migrations to unlock shared profile, storage, and batch history.'}
              </p>
            )}

            {latestResult ? (
              <div className="style-columns top-gap">
                <div>
                  <span className="style-label">Fonts</span>
                  <ul>
                    {latestResult.dominantFonts.length > 0 ? latestResult.dominantFonts.map((font) => <li key={font}>{font}</li>) : <li>Not detected</li>}
                  </ul>
                </div>
                <div>
                  <span className="style-label">Sizes</span>
                  <ul>
                    {latestResult.dominantSizes.length > 0 ? latestResult.dominantSizes.map((size) => <li key={size}>{size} half-points</li>) : <li>Not detected</li>}
                  </ul>
                </div>
                <div>
                  <span className="style-label">Watch hits</span>
                  <ul>
                    {(latestResult.watchTermsFound.length > 0 ? latestResult.watchTermsFound : latestResult.processedParts).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </article>
        </div>
      </section>
    </main>
  )
}

export default App
