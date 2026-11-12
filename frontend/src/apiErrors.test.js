import assert from 'node:assert/strict'
import test from 'node:test'
import { formatApiError } from './apiErrors.js'

test('keeps a normal API detail string readable', () => {
  assert.equal(formatApiError({ detail: 'Invalid username or password' }), 'Invalid username or password')
})

test('turns FastAPI validation details into readable field messages', () => {
  const payload = {
    detail: [{ type: 'missing', loc: ['body', 'username'], msg: 'Field required' }],
  }
  assert.equal(formatApiError(payload), 'Username: Field required')
  assert.doesNotMatch(formatApiError(payload), /\[object Object\]/)
})

test('unwraps nested object error messages without coercing the object', () => {
  const payload = { error: { detail: { message: 'Service is temporarily unavailable' } } }
  assert.equal(formatApiError(payload), 'Service is temporarily unavailable')
})

test('uses a safe fallback when the API returns no useful message', () => {
  assert.equal(formatApiError({ code: 'AUTH_FAILED' }, 'Sign-in failed. Try again.'), 'Sign-in failed. Try again.')
})
