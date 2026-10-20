// Reading a Midst timelapse archive (.midst.zip): the text of its first file. Shared by the poem player
// (store/actions.ts) and the publisher's review page (app/review.ts).
//
// The zip library is @zip.js/zip.js, bundled from npm (midst-web #270). It replaced zip.js 1.x, which the page loaded
// from the old production host with three worker scripts of its own. Its workers are built in, so nothing is
// configured here.
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'

// How long the archive read may take before it is given up. The library inflates in a worker, and a worker that
// never answers would otherwise leave the reader waiting for ever.
export const ARCHIVE_READ_TIMEOUT_MS = 30000

/** Why an archive could not be read. `damaged`: the bytes are not a readable archive. `timeout`: it took too long. */
export class ArchiveError extends Error {
  constructor (readonly kind: 'damaged' | 'timeout', message: string) {
    super(message)
    this.name = 'ArchiveError'
  }
}

// What went wrong, for the log: the error's name and message, never its data. The library's messages are fixed strings
// ('File format is not recognized', 'Invalid CRC32') and a DOMException has a name, so a bug in our own code (a
// TypeError) reads as ours and not as a damaged file. Never for a parser's error, which can quote the poem.
export const describeCause = (err: unknown): string => {
  if (typeof err === 'string') return err.slice(0, 200)
  if (err && typeof err === 'object' && 'name' in err && 'message' in err) {
    const { name, message } = err as { name: unknown, message: unknown }
    return `${String(name)}: ${String(message)}`.slice(0, 200)
  }
  return err === undefined ? 'no cause given' : `a thrown ${typeof err}`
}

/**
 * The text of the first file in `archive`, decoded as UTF-8, its CRC-32 checked. Rejects with an ArchiveError:
 * `damaged` for an archive the library cannot read, one with no entries, or a CRC mismatch; `timeout` after
 * `timeoutMs`. The message carries the library's own fixed text, never the archive's contents.
 */
export async function readFirstEntry(archive: Blob, timeoutMs = ARCHIVE_READ_TIMEOUT_MS): Promise<string> {
  const reader = new ZipReader(new BlobReader(archive))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ArchiveError('timeout', 'Reading the Midst archive timed out')), timeoutMs)
  })
  const read = (async () => {
    let entries
    try {
      entries = await reader.getEntries()
    } catch (err) {
      throw new ArchiveError('damaged', `Unable to read Midst archive: ${describeCause(err)}`)
    }
    const first = entries[0]
    if (!first || first.directory) throw new ArchiveError('damaged', 'Unable to read Midst archive: the archive has no entries')
    try {
      return await first.getData(new TextWriter(), { checkSignature: true })
    } catch (err) {
      throw new ArchiveError('damaged', `Unable to read Midst archive: ${describeCause(err)}`)
    }
  })()
  // The read that loses to the timeout may still reject later; that rejection is already answered by the timeout.
  read.catch(() => {})
  try {
    return await Promise.race([read, timeout])
  } finally {
    clearTimeout(timer)
    // Releases the library's workers. A close that fails changes nothing for the caller, who has the text or the error.
    reader.close().catch(() => {})
  }
}
