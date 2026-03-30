export type IssueSeverity = 'critical' | 'warning' | 'info'

export type IssueCode =
  | 'double-space'
  | 'manual-tab'
  | 'trailing-whitespace'
  | 'blank-paragraph-run'
  | 'clause-numbering-gap'
  | 'cross-reference-mismatch'
  | 'schedule-reference-mismatch'
  | 'signature-block-missing'
  | 'defined-term-unused'
  | 'font-inconsistency'
  | 'house-font-mismatch'
  | 'house-size-mismatch'
  | 'size-inconsistency'
  | 'manual-line-break-heavy'
  | 'smart-quote-mix'
  | 'header-footer-watchlist'

export interface DocumentIssue {
  id: string
  code: IssueCode
  severity: IssueSeverity
  title: string
  detail: string
  location: string
  occurrences: number
}

export interface HouseStyleProfile {
  id: string
  name: string
  description: string
  preferredFonts: string[]
  preferredSizes: string[]
  footerWatchTerms: string[]
  source?: 'local' | 'remote'
}

export interface ProcessingOptions {
  profile: HouseStyleProfile
  watchTerms: string[]
}

export interface AnalysisSummary {
  filesProcessed: number
  paragraphs: number
  runs: number
  textNodes: number
  manualBreaks: number
  tabs: number
  doubleSpacesFixed: number
  tabsNormalized: number
  trailingWhitespaceFixed: number
  blankParagraphsCollapsed: number
}

export interface AnalysisResult {
  sourceFileName: string
  appliedProfileName: string
  watchTermsFound: string[]
  issues: DocumentIssue[]
  summary: AnalysisSummary
  cleanedFileName: string
  reportFileName: string
  cleanedBlob: Blob
  reportBlob: Blob
  preview: string[]
  dominantFonts: string[]
  dominantSizes: string[]
  processedParts: string[]
}

export interface BatchRunRecord {
  id: string
  createdAt: string
  profileName: string
  filesProcessed: number
  issuesLogged: number
  criticalChecks: number
  watchHits: number
  bundleStoragePath?: string | null
}

export interface BatchDocumentRecord {
  id: string
  batchRunId: string
  sourceFileName: string
  appliedProfileName: string
  watchTermsFound: string[]
  issueCount: number
  criticalCount: number
  processedParts: string[]
  dominantFonts: string[]
  dominantSizes: string[]
  preview: string[]
  issuePayload: DocumentIssue[]
  cleanedDocStoragePath?: string | null
  reportStoragePath?: string | null
  createdAt: string
}
