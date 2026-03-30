export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-GB').format(value)
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function toTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      message?: unknown
      error_description?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
    }

    const parts = [
      typeof candidate.message === 'string' ? candidate.message : '',
      typeof candidate.error_description === 'string' ? candidate.error_description : '',
      typeof candidate.details === 'string' ? candidate.details : '',
      typeof candidate.hint === 'string' ? candidate.hint : '',
      typeof candidate.code === 'string' ? `Code: ${candidate.code}` : '',
    ].filter(Boolean)

    if (parts.length > 0) {
      return parts.join(' | ')
    }

    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}
