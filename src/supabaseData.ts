import JSZip from 'jszip'
import type {
  AnalysisResult,
  BatchDocumentRecord,
  BatchRunRecord,
  HouseStyleProfile,
} from './types'
import { supabase } from './supabase'

const STORAGE_BUCKET = 'document-production'

function ensureSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  return supabase
}

async function requireUserId() {
  const client = ensureSupabase()
  const { data, error } = await client.auth.getUser()
  if (error) {
    throw error
  }
  const userId = data.user?.id
  if (!userId) {
    throw new Error('You must sign in to use Supabase-backed features.')
  }
  return userId
}

function mapProfile(row: {
  id: string
  name: string
  description: string
  preferred_fonts: string[]
  preferred_sizes: string[]
  footer_watch_terms: string[]
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preferredFonts: row.preferred_fonts,
    preferredSizes: row.preferred_sizes,
    footerWatchTerms: row.footer_watch_terms,
    source: 'remote' as const,
  }
}

function mapRun(row: {
  id: string
  created_at: string
  profile_name: string
  files_processed: number
  issues_logged: number
  critical_checks: number
  watch_hits: number
  bundle_storage_path?: string | null
}): BatchRunRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    profileName: row.profile_name,
    filesProcessed: row.files_processed,
    issuesLogged: row.issues_logged,
    criticalChecks: row.critical_checks,
    watchHits: row.watch_hits,
    bundleStoragePath: row.bundle_storage_path ?? null,
  }
}

function mapDocument(row: {
  id: string
  batch_run_id: string
  source_file_name: string
  applied_profile_name: string
  watch_terms_found: string[]
  issue_count: number
  critical_count: number
  processed_parts: string[]
  dominant_fonts: string[]
  dominant_sizes: string[]
  preview: string[]
  issue_payload: AnalysisResult['issues']
  cleaned_doc_storage_path?: string | null
  report_storage_path?: string | null
  created_at: string
}): BatchDocumentRecord {
  return {
    id: row.id,
    batchRunId: row.batch_run_id,
    sourceFileName: row.source_file_name,
    appliedProfileName: row.applied_profile_name,
    watchTermsFound: row.watch_terms_found,
    issueCount: row.issue_count,
    criticalCount: row.critical_count,
    processedParts: row.processed_parts,
    dominantFonts: row.dominant_fonts,
    dominantSizes: row.dominant_sizes,
    preview: row.preview,
    issuePayload: row.issue_payload,
    cleanedDocStoragePath: row.cleaned_doc_storage_path ?? null,
    reportStoragePath: row.report_storage_path ?? null,
    createdAt: row.created_at,
  }
}

async function buildBatchBundle(results: AnalysisResult[]) {
  const zip = new JSZip()
  const summaryLines = [
    'Batch Summary',
    '=============',
    '',
    ...results.map(
      (result) =>
        `${result.sourceFileName} | profile: ${result.appliedProfileName} | watch hits: ${
          result.watchTermsFound.join(', ') || 'none'
        } | issues: ${result.issues.length}`,
    ),
    '',
  ]

  for (const result of results) {
    zip.file(result.cleanedFileName, await result.cleanedBlob.arrayBuffer())
    zip.file(result.reportFileName, await result.reportBlob.text())
  }

  zip.file('batch-summary.txt', summaryLines.join('\n'))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

async function uploadArtifact(path: string, fileBody: Blob | ArrayBuffer | string, contentType: string) {
  const client = ensureSupabase()
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, fileBody, {
    contentType,
    upsert: true,
  })

  if (error) {
    throw error
  }

  return path
}

export async function getStorageSignedUrl(path: string) {
  const client = ensureSupabase()
  const { data, error } = await client.storage.from(STORAGE_BUCKET).createSignedUrl(path, 60 * 15)
  if (error) {
    throw error
  }
  return data.signedUrl
}

export async function fetchSupabaseProfiles() {
  const client = ensureSupabase()
  const { data, error } = await client
    .from('style_profiles')
    .select('id, name, description, preferred_fonts, preferred_sizes, footer_watch_terms')
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapProfile)
}

export async function saveSupabaseProfile(profile: HouseStyleProfile) {
  const client = ensureSupabase()
  const userId = await requireUserId()
  const payload = {
    id: profile.id,
    owner_user_id: userId,
    name: profile.name,
    description: profile.description,
    preferred_fonts: profile.preferredFonts,
    preferred_sizes: profile.preferredSizes,
    footer_watch_terms: profile.footerWatchTerms,
  }

  const { data, error } = await client
    .from('style_profiles')
    .upsert(payload, { onConflict: 'id' })
    .select('id, name, description, preferred_fonts, preferred_sizes, footer_watch_terms')
    .single()

  if (error) {
    throw error
  }

  return mapProfile(data)
}

export async function fetchBatchRuns(limit = 8): Promise<BatchRunRecord[]> {
  const client = ensureSupabase()
  const { data, error } = await client
    .from('batch_runs')
    .select('id, created_at, profile_name, files_processed, issues_logged, critical_checks, watch_hits, bundle_storage_path')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw error
  }

  return (data ?? []).map(mapRun)
}

export async function fetchBatchDocuments(batchRunId: string): Promise<BatchDocumentRecord[]> {
  const client = ensureSupabase()
  const { data, error } = await client
    .from('batch_documents')
    .select(
      'id, batch_run_id, source_file_name, applied_profile_name, watch_terms_found, issue_count, critical_count, processed_parts, dominant_fonts, dominant_sizes, preview, issue_payload, cleaned_doc_storage_path, report_storage_path, created_at',
    )
    .eq('batch_run_id', batchRunId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []).map(mapDocument)
}

export async function saveBatchRun(results: AnalysisResult[], watchTerms: string[]) {
  const client = ensureSupabase()
  const userId = await requireUserId()
  const filesProcessed = results.length
  const issuesLogged = results.reduce((sum, result) => sum + result.issues.length, 0)
  const criticalChecks = results.reduce(
    (sum, result) => sum + result.issues.filter((issue) => issue.severity === 'critical').length,
    0,
  )
  const watchHits = results.reduce((sum, result) => sum + result.watchTermsFound.length, 0)
  const profileName = results[0]?.appliedProfileName ?? 'Unknown'

  const { data: run, error: runError } = await client
    .from('batch_runs')
    .insert({
      owner_user_id: userId,
      profile_name: profileName,
      files_processed: filesProcessed,
      issues_logged: issuesLogged,
      critical_checks: criticalChecks,
      watch_hits: watchHits,
      watch_terms: watchTerms,
    })
    .select('id, created_at, profile_name, files_processed, issues_logged, critical_checks, watch_hits, bundle_storage_path')
    .single()

  if (runError) {
    throw runError
  }

  const bundleBlob = await buildBatchBundle(results)
  const bundleStoragePath = await uploadArtifact(
    `${userId}/${run.id}/document-production-batch.zip`,
    bundleBlob,
    'application/zip',
  )

  const { error: updateRunError } = await client
    .from('batch_runs')
    .update({ bundle_storage_path: bundleStoragePath })
    .eq('id', run.id)

  if (updateRunError) {
    throw updateRunError
  }

  const documentsPayload = []
  for (const result of results) {
    const cleanedDocStoragePath = await uploadArtifact(
      `${userId}/${run.id}/${result.cleanedFileName}`,
      result.cleanedBlob,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    const reportStoragePath = await uploadArtifact(
      `${userId}/${run.id}/${result.reportFileName}`,
      result.reportBlob,
      'text/plain;charset=utf-8',
    )

    documentsPayload.push({
      owner_user_id: userId,
      batch_run_id: run.id,
      source_file_name: result.sourceFileName,
      applied_profile_name: result.appliedProfileName,
      watch_terms_found: result.watchTermsFound,
      issue_count: result.issues.length,
      critical_count: result.issues.filter((issue) => issue.severity === 'critical').length,
      processed_parts: result.processedParts,
      dominant_fonts: result.dominantFonts,
      dominant_sizes: result.dominantSizes,
      preview: result.preview,
      issue_payload: result.issues,
      cleaned_doc_storage_path: cleanedDocStoragePath,
      report_storage_path: reportStoragePath,
    })
  }

  const { data: insertedDocuments, error: documentsError } = await client
    .from('batch_documents')
    .insert(documentsPayload)
    .select(
      'id, batch_run_id, source_file_name, applied_profile_name, watch_terms_found, issue_count, critical_count, processed_parts, dominant_fonts, dominant_sizes, preview, issue_payload, cleaned_doc_storage_path, report_storage_path, created_at',
    )

  if (documentsError) {
    throw documentsError
  }

  return {
    run: mapRun({ ...run, bundle_storage_path: bundleStoragePath }),
    documents: (insertedDocuments ?? []).map(mapDocument),
  }
}
