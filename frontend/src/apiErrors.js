const FIELD_LABELS = {
  email: 'Email address',
  name: 'Name',
  username: 'Username',
  password: 'Password',
}

function issueMessage(issue) {
  if (typeof issue === 'string') return issue
  if (!issue || typeof issue !== 'object') return ''

  const message = issue.msg || issue.message || issue.error_description || issue.title
  if (typeof message !== 'string') return ''

  const location = Array.isArray(issue.loc) ? issue.loc.filter(part => part !== 'body' && part !== 'query' && part !== 'path') : []
  const field = location.length ? FIELD_LABELS[location.at(-1)] || String(location.at(-1)).replaceAll('_', ' ') : ''
  return field ? `${field}: ${message}` : message
}

function collectMessages(value) {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(collectMessages).filter(Boolean).join(' · ')
  if (!value || typeof value !== 'object') return ''

  const direct = issueMessage(value)
  if (direct) return direct

  for (const key of ['detail', 'message', 'error_description', 'error', 'errors']) {
    const nested = collectMessages(value[key])
    if (nested) return nested
  }

  return ''
}

export function formatApiError(payload, fallback = 'The request could not be completed. Please try again.') {
  const message = collectMessages(payload)
  return message || fallback
}
