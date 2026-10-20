// The archive reader against real archives, made here with the same library (midst-web #270). No poem data: the
// contents are synthetic.
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { ARCHIVE_READ_TIMEOUT_MS, ArchiveError, describeCause, readFirstEntry } from '../archive'

const TEXT = '{"zq":"héllo, wörld"}'

async function archiveOf(files: [string, string][], level?: number): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), level === undefined ? {} : { level })
  for (const [name, text] of files) await writer.add(name, new TextReader(text))
  return writer.close()
}

const rejection = async (promise: Promise<unknown>): Promise<ArchiveError> => {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(ArchiveError)
    return err as ArchiveError
  }
  throw new Error('expected a rejection')
}

test('the first file of a real archive, decoded as UTF-8', async () => {
  expect(await readFirstEntry(await archiveOf([['poem.midst', TEXT], ['other.midst', 'zq other']]))).toBe(TEXT)
})

test('bytes that are not an archive are damaged, with the library\'s own message', async () => {
  const err = await rejection(readFirstEntry(new Blob(['zq not a zip'])))
  expect(err.kind).toBe('damaged')
  expect(err.message).toBe('Unable to read Midst archive: Error: File format is not recognized')
})

test('an archive with no entries is damaged', async () => {
  const err = await rejection(readFirstEntry(await archiveOf([])))
  expect(err.kind).toBe('damaged')
  expect(err.message).toBe('Unable to read Midst archive: the archive has no entries')
})

test('a changed byte in the entry is a CRC mismatch, damaged, and the contents are not in the message', async () => {
  const stored = new Uint8Array(await (await archiveOf([['poem.midst', 'zqxvzqxvzqxvzqxv-abcdefghijklmnop']], 0)).arrayBuffer())
  const at = Buffer.from(stored).indexOf('abcdefgh')
  expect(at).toBeGreaterThan(0)
  stored[at + 2] ^= 1
  const err = await rejection(readFirstEntry(new Blob([stored])))
  expect(err.kind).toBe('damaged')
  expect(err.message).toBe('Unable to read Midst archive: Error: Invalid CRC32')
  expect(err.message).not.toMatch(/zqxv|abc/)
})

test('a read that never finishes times out, and the timer is the only thing that ends it', async () => {
  jest.useFakeTimers()
  try {
    // A Blob whose bytes never arrive: the library waits on them for ever.
    const stalled = { size: 100, type: 'application/zip', slice: () => stalled, arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) } as unknown as Blob
    const pending = rejection(readFirstEntry(stalled, 1000))
    await jest.advanceTimersByTimeAsync(999)
    let settled = false
    pending.then(() => { settled = true }, () => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    const err = await pending
    expect(err.kind).toBe('timeout')
    expect(err.message).toBe('Reading the Midst archive timed out')
  } finally {
    jest.useRealTimers()
  }
})

test('the default timeout is 30 s', () => {
  expect(ARCHIVE_READ_TIMEOUT_MS).toBe(30000)
})

test('describeCause gives the name and message only, never other fields', () => {
  expect(describeCause(new TypeError('zq'))).toBe('TypeError: zq')
  expect(describeCause({ data: 'zq poem text' })).toBe('a thrown object')
})
