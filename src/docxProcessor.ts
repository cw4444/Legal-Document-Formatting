import JSZip from 'jszip'
import type {
  AnalysisResult,
  DocumentIssue,
  IssueCode,
  IssueSeverity,
  ProcessingOptions,
} from './types'
import { buildReportText } from './report'

const BASE_WORD_PATHS = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml', 'word/comments.xml']
const HEADER_FOOTER_PATH_PATTERN = /^word\/(header|footer)\d+\.xml$/i
const FONT_PATTERN = /w:rFonts[^>]*w:ascii="([^"]+)"/g
const SIZE_PATTERN = /w:sz[^>]*w:val="([^"]+)"/g
const TEXT_PATTERN = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
const BREAK_PATTERN = /<w:br\b[^>]*\/>/g
const TAB_PATTERN = /<w:tab\b[^>]*\/>/g
const PARAGRAPH_PATTERN = /<w:p\b[\s\S]*?<\/w:p>/g
const CLAUSE_NUMBER_PATTERN = /^(\d+(?:\.\d+)*)\.?\s+/
const CLAUSE_REFERENCE_PATTERN = /\bclause(?:s)?\s+(\d+(?:\.\d+)*)\b/gi
const SCHEDULE_REFERENCE_PATTERN = /\b(schedule|appendix)\s+([a-z0-9]+)\b/gi
const EXECUTION_TRIGGER_PATTERN = /\b(executed as a deed|signed for and on behalf of|executed by)\b/i
const SIGNATURE_MARKER_PATTERN = /\b(signature|signed by|name:|position:|title:|date:|director|witness)\b/i
const DEFINED_TERM_PATTERN = /[“"]([A-Z][A-Za-z0-9/&,\- ]{1,40})[”"]/g

function decodeXml(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function collectCounts(xml: string, pattern: RegExp) {
  const counts = new Map<string, number>()
  let match = pattern.exec(xml)

  while (match) {
    const key = match[1]
    counts.set(key, (counts.get(key) ?? 0) + 1)
    match = pattern.exec(xml)
  }

  pattern.lastIndex = 0
  return counts
}

function topValues(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([value]) => value)
}

function createIssue(
  code: IssueCode,
  severity: IssueSeverity,
  title: string,
  detail: string,
  location: string,
  occurrences: number,
): DocumentIssue {
  return {
    id: `${code}-${location}-${occurrences}`,
    code,
    severity,
    title,
    detail,
    location,
    occurrences,
  }
}

function getWordContentPaths(zip: JSZip) {
  const paths = [...BASE_WORD_PATHS]
  for (const path of Object.keys(zip.files)) {
    if (HEADER_FOOTER_PATH_PATTERN.test(path)) {
      paths.push(path)
    }
  }

  return paths.filter((path, index, array) => array.indexOf(path) === index && zip.file(path))
}

function normalizeForMatch(value: string) {
  return value.trim().toLowerCase()
}

function normalizeParagraphText(paragraph: string) {
  return decodeXml(
    paragraph
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function countOccurrences(haystack: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = haystack.match(new RegExp(`\\b${escaped}\\b`, 'gi'))
  return matches?.length ?? 0
}

function addStructuralIssues(paragraphTexts: string[], fullBodyText: string, issues: DocumentIssue[]) {
  const clauseNumbers = paragraphTexts
    .map((paragraph) => paragraph.match(CLAUSE_NUMBER_PATTERN)?.[1] ?? null)
    .filter((value): value is string => value !== null)

  let numberingDrift = 0
  let lastTopLevel: number | null = null

  for (const clause of clauseNumbers) {
    const [topLevelText] = clause.split('.')
    const topLevel = Number(topLevelText)
    if (!Number.isFinite(topLevel)) {
      continue
    }

    if (lastTopLevel !== null && topLevel > lastTopLevel + 1) {
      numberingDrift += 1
    }

    lastTopLevel = Math.max(lastTopLevel ?? topLevel, topLevel)
  }

  if (numberingDrift > 0) {
    issues.push(
      createIssue(
        'clause-numbering-gap',
        'critical',
        'Clause numbering drift detected',
        'The body appears to jump across clause numbers, which usually means a heading or clause has been lost or renumbered badly.',
        'Main document body',
        numberingDrift,
      ),
    )
  }

  const clauseSet = new Set(clauseNumbers)
  const clauseReferenceMisses = new Set<string>()
  let clauseReferenceMatch = CLAUSE_REFERENCE_PATTERN.exec(fullBodyText)
  while (clauseReferenceMatch) {
    if (!clauseSet.has(clauseReferenceMatch[1])) {
      clauseReferenceMisses.add(clauseReferenceMatch[1])
    }
    clauseReferenceMatch = CLAUSE_REFERENCE_PATTERN.exec(fullBodyText)
  }
  CLAUSE_REFERENCE_PATTERN.lastIndex = 0

  if (clauseReferenceMisses.size > 0) {
    issues.push(
      createIssue(
        'cross-reference-mismatch',
        'critical',
        'Clause cross-reference mismatch',
        `Referenced clauses were not found as numbered headings: ${[...clauseReferenceMisses].join(', ')}.`,
        'Cross-references',
        clauseReferenceMisses.size,
      ),
    )
  }

  const scheduleHeadings = new Set(
    paragraphTexts
      .map((paragraph) => paragraph.match(/^(schedule|appendix)\s+([a-z0-9]+)/i))
      .filter((value): value is RegExpMatchArray => value !== null)
      .map((match) => `${match[1].toLowerCase()} ${match[2].toLowerCase()}`),
  )

  const scheduleReferenceMisses = new Set<string>()
  let scheduleReferenceMatch = SCHEDULE_REFERENCE_PATTERN.exec(fullBodyText)
  while (scheduleReferenceMatch) {
    const token = `${scheduleReferenceMatch[1].toLowerCase()} ${scheduleReferenceMatch[2].toLowerCase()}`
    if (!scheduleHeadings.has(token)) {
      scheduleReferenceMisses.add(token)
    }
    scheduleReferenceMatch = SCHEDULE_REFERENCE_PATTERN.exec(fullBodyText)
  }
  SCHEDULE_REFERENCE_PATTERN.lastIndex = 0

  if (scheduleReferenceMisses.size > 0) {
    issues.push(
      createIssue(
        'schedule-reference-mismatch',
        'warning',
        'Schedule or appendix reference mismatch',
        `Referenced schedules or appendices were not found as headings: ${[...scheduleReferenceMisses].join(', ')}.`,
        'Schedules and appendices',
        scheduleReferenceMisses.size,
      ),
    )
  }

  if (EXECUTION_TRIGGER_PATTERN.test(fullBodyText) && !SIGNATURE_MARKER_PATTERN.test(fullBodyText)) {
    issues.push(
      createIssue(
        'signature-block-missing',
        'critical',
        'Execution wording found without signature block markers',
        'The document reads like it needs execution language, but signature labels such as Name, Title, Date, or witness markers were not found.',
        'Execution block',
        1,
      ),
    )
  }

  const definedTerms = new Set<string>()
  let definedTermMatch = DEFINED_TERM_PATTERN.exec(fullBodyText)
  while (definedTermMatch) {
    const term = definedTermMatch[1].trim()
    if (term.includes(' ')) {
      definedTerms.add(term)
    }
    definedTermMatch = DEFINED_TERM_PATTERN.exec(fullBodyText)
  }
  DEFINED_TERM_PATTERN.lastIndex = 0

  const unusedTerms = [...definedTerms].filter((term) => countOccurrences(fullBodyText, term) < 2)
  if (unusedTerms.length > 0) {
    issues.push(
      createIssue(
        'defined-term-unused',
        'info',
        'Defined terms may be orphaned',
        `Quoted defined terms appeared only once: ${unusedTerms.slice(0, 6).join(', ')}${unusedTerms.length > 6 ? '...' : ''}.`,
        'Defined terms',
        unusedTerms.length,
      ),
    )
  }
}

export async function processDocx(file: File, options: ProcessingOptions): Promise<AnalysisResult> {
  const bytes = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(bytes)
  const availablePaths = getWordContentPaths(zip)

  if (availablePaths.length === 0) {
    throw new Error('This .docx file does not contain Word content XML.')
  }

  const fontCounts = new Map<string, number>()
  const sizeCounts = new Map<string, number>()
  const headerFooterTexts: string[] = []
  const mainParagraphTexts: string[] = []
  let doubleSpacesFixed = 0
  let trailingWhitespaceFixed = 0
  let textNodes = 0
  let previewText = ''
  let paragraphsCount = 0
  let runsCount = 0
  let manualBreaksCount = 0
  let tabsCount = 0
  let blankParagraphsCollapsed = 0

  for (const path of availablePaths) {
    const entry = zip.file(path)
    if (!entry) {
      continue
    }

    const originalXml = await entry.async('string')
    runsCount += (originalXml.match(/<w:r\b/g) ?? []).length

    const fileFontCounts = collectCounts(originalXml, FONT_PATTERN)
    const fileSizeCounts = collectCounts(originalXml, SIZE_PATTERN)

    for (const [font, count] of fileFontCounts) {
      fontCounts.set(font, (fontCounts.get(font) ?? 0) + count)
    }

    for (const [size, count] of fileSizeCounts) {
      sizeCounts.set(size, (sizeCounts.get(size) ?? 0) + count)
    }

    const cleanedXml = originalXml.replace(TEXT_PATTERN, (whole, rawText: string) => {
      textNodes += 1
      const decoded = decodeXml(rawText)
      previewText += ` ${decoded}`

      if (path.includes('header') || path.includes('footer')) {
        headerFooterTexts.push(decoded)
      }

      const doubleSpaceMatches = decoded.match(/ {2,}/g)
      doubleSpacesFixed += doubleSpaceMatches?.length ?? 0

      if (/[ \t]+$/.test(decoded)) {
        trailingWhitespaceFixed += 1
      }

      const normalized = decoded.replace(/ {2,}/g, ' ').replace(/[ \t]+$/g, '')
      return whole.replace(rawText, escapeXml(normalized))
    })

    const tabMatches = cleanedXml.match(TAB_PATTERN) ?? []
    const manualBreakMatches = cleanedXml.match(BREAK_PATTERN) ?? []
    const paragraphs = cleanedXml.match(PARAGRAPH_PATTERN) ?? []

    tabsCount += tabMatches.length
    manualBreaksCount += manualBreakMatches.length
    paragraphsCount += paragraphs.length

    const paragraphBuffer: string[] = []
    let blankStreak = 0

    for (const paragraph of paragraphs) {
      const stripped = normalizeParagraphText(paragraph)

      if (stripped.length === 0) {
        blankStreak += 1
        if (blankStreak > 1) {
          blankParagraphsCollapsed += 1
          continue
        }
      } else {
        blankStreak = 0
      }

      if (path === 'word/document.xml') {
        mainParagraphTexts.push(stripped)
      }

      paragraphBuffer.push(paragraph)
    }

    let paragraphIndex = 0
    const collapsedXml =
      paragraphBuffer.length === paragraphs.length
        ? cleanedXml
        : cleanedXml.replace(PARAGRAPH_PATTERN, () => paragraphBuffer[paragraphIndex++] ?? '')

    const normalizedXml = collapsedXml.replace(TAB_PATTERN, '<w:t xml:space="preserve">    </w:t>')
    zip.file(path, normalizedXml)
  }

  const dominantFonts = topValues(fontCounts)
  const dominantSizes = topValues(sizeCounts)
  const tabsNormalized = tabsCount
  const issues: DocumentIssue[] = []

  if (doubleSpacesFixed > 0) {
    issues.push(createIssue('double-space', 'warning', 'Double spaces cleaned up', 'Repeated spaces were normalized automatically.', 'Across text runs', doubleSpacesFixed))
  }

  if (tabsNormalized > 0) {
    issues.push(createIssue('manual-tab', 'warning', 'Manual tabs found', 'Word tab markers were converted to preserved spaces for a steadier baseline.', 'Across text runs', tabsNormalized))
  }

  if (trailingWhitespaceFixed > 0) {
    issues.push(createIssue('trailing-whitespace', 'info', 'Trailing whitespace removed', 'Whitespace at the ends of text runs was trimmed.', 'Across text runs', trailingWhitespaceFixed))
  }

  if (blankParagraphsCollapsed > 0) {
    issues.push(createIssue('blank-paragraph-run', 'warning', 'Repeated blank paragraphs collapsed', 'Multiple empty paragraphs in a row were reduced to a single spacer.', 'Paragraph structure', blankParagraphsCollapsed))
  }

  if (manualBreaksCount >= 8) {
    issues.push(createIssue('manual-line-break-heavy', 'critical', 'Heavy use of manual line breaks', 'This document likely uses manual formatting instead of paragraph styles, which usually needs review.', 'Document layout', manualBreaksCount))
  }

  const mixedQuoteCount =
    (previewText.match(/[“”]/g)?.length ?? 0) > 0 && (previewText.match(/"/g)?.length ?? 0) > 0 ? 1 : 0
  if (mixedQuoteCount > 0) {
    issues.push(createIssue('smart-quote-mix', 'info', 'Mixed quote styles detected', 'The document contains both straight and curly double quotes.', 'Body text', mixedQuoteCount))
  }

  if (dominantFonts.length > 1) {
    issues.push(createIssue('font-inconsistency', 'critical', 'Multiple font families detected', `Top fonts: ${dominantFonts.join(', ')}.`, 'Character styling', dominantFonts.length))
  }

  if (dominantSizes.length > 1) {
    issues.push(createIssue('size-inconsistency', 'warning', 'Multiple font sizes detected', `Top sizes: ${dominantSizes.join(', ')} half-points.`, 'Character styling', dominantSizes.length))
  }

  const preferredFonts = options.profile.preferredFonts.map(normalizeForMatch)
  const fontMismatches = dominantFonts.filter((font) => !preferredFonts.includes(normalizeForMatch(font)))
  if (fontMismatches.length > 0) {
    issues.push(
      createIssue(
        'house-font-mismatch',
        'critical',
        'House style font mismatch',
        `${options.profile.name} expects ${options.profile.preferredFonts.join(', ')}, but found ${fontMismatches.join(', ')} in dominant usage.`,
        'House style profile',
        fontMismatches.length,
      ),
    )
  }

  const preferredSizes = options.profile.preferredSizes.map(normalizeForMatch)
  const sizeMismatches = dominantSizes.filter((size) => !preferredSizes.includes(normalizeForMatch(size)))
  if (sizeMismatches.length > 0) {
    issues.push(
      createIssue(
        'house-size-mismatch',
        'warning',
        'House style size mismatch',
        `${options.profile.name} expects ${options.profile.preferredSizes.join(', ')} half-points, but found ${sizeMismatches.join(', ')}.`,
        'House style profile',
        sizeMismatches.length,
      ),
    )
  }

  const watchTerms = [...options.profile.footerWatchTerms, ...options.watchTerms]
    .map((term) => term.trim())
    .filter(Boolean)
  const normalizedHeaderFooter = headerFooterTexts.join(' ').toLowerCase()
  const watchTermsFound = watchTerms.filter((term, index, array) => {
    const normalized = term.toLowerCase()
    return array.findIndex((item) => item.toLowerCase() === normalized) === index && normalizedHeaderFooter.includes(normalized)
  })

  if (watchTermsFound.length > 0) {
    issues.push(
      createIssue(
        'header-footer-watchlist',
        'critical',
        'Header/footer watchlist hit',
        `Potential stale matter details found in headers or footers: ${watchTermsFound.join(', ')}.`,
        'Header and footer text',
        watchTermsFound.length,
      ),
    )
  }

  if (availablePaths.length > 1) {
    issues.push(
      createIssue(
        'smart-quote-mix',
        'info',
        'Multiple Word parts processed',
        `Cleanup covered ${availablePaths.length} content files including headers, footers, comments, or notes where present.`,
        'Package structure',
        availablePaths.length,
      ),
    )
  }

  addStructuralIssues(mainParagraphTexts, mainParagraphTexts.join('\n'), issues)

  const cleanedBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  const cleanedFileName = file.name.replace(/\.docx$/i, '') + '.cleaned.docx'
  const reportFileName = file.name.replace(/\.docx$/i, '') + '.production-report.txt'

  const result: AnalysisResult = {
    sourceFileName: file.name,
    appliedProfileName: options.profile.name,
    watchTermsFound,
    issues,
    summary: {
      filesProcessed: 1,
      paragraphs: paragraphsCount,
      runs: runsCount,
      textNodes,
      manualBreaks: manualBreaksCount,
      tabs: tabsCount,
      doubleSpacesFixed,
      tabsNormalized,
      trailingWhitespaceFixed,
      blankParagraphsCollapsed,
    },
    cleanedFileName,
    reportFileName,
    cleanedBlob,
    reportBlob: new Blob([]),
    preview: previewText
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .slice(0, 5),
    dominantFonts,
    dominantSizes,
    processedParts: availablePaths.map((path) => path.replace(/^word\//, '')),
  }

  result.reportBlob = new Blob([buildReportText(file.name, result)], { type: 'text/plain;charset=utf-8' })

  return result
}
