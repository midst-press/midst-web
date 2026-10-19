// The edit time under the timeline, as Annelyse asked for it (GitHub midst-web #63, Gitea #225): the time on one
// line and the date on the next, "7:19 pm" over "November 5, 2019". Formatted in the page's language (the
// catalog's), not the browser's region, so every reader of the English page sees the same form. The reader's own
// time zone is used, as before.

export interface EditTime {
  time: string
  date: string
}

/** `ms` as a time ("7:19 pm") and a date ("November 5, 2019") in `locale`. The day period is lower-cased, after
 *  an ordinary space.
 *  `timeZone` is for tests; by default it is the reader's. */
export function editTime(ms: number, locale: string, timeZone?: string): EditTime {
  const when = new Date(ms)
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone })
    .formatToParts(when)
    // ICU puts a narrow no-break space (U+202F) before the day period; her example has an ordinary one.
    .map(part => (part.type === 'dayPeriod' ? part.value.toLowerCase() : part.value.replace(/\u202f/g, ' ')))
    .join('')
  const date = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone }).format(when)
  return { time, date }
}
