import { editTime } from '../components/MidstPlayer/edit-time'

// The edit time under the timeline, in the form Annelyse asked for (#225): "7:19 pm" over "November 5, 2019".
// Time zones are given, so the cases do not depend on the machine running them.

describe('editTime', () => {
  it("is Annelyse's example: the time with a lower-case day period, and the date with the month in full", () => {
    expect(editTime(Date.UTC(2019, 10, 6, 1, 19), 'en', 'America/Chicago')).toEqual({ time: '7:19 pm', date: 'November 5, 2019' })
  })

  it('has no leading zero on the hour, and two digits for the minutes', () => {
    expect(editTime(Date.UTC(2021, 7, 5, 9, 5), 'en', 'UTC').time).toBe('9:05 am')
  })

  it('says midnight and noon as 12 am and 12 pm', () => {
    expect(editTime(Date.UTC(2021, 0, 1, 0, 0), 'en', 'UTC').time).toBe('12:00 am')
    expect(editTime(Date.UTC(2021, 0, 1, 12, 0), 'en', 'UTC').time).toBe('12:00 pm')
  })

  it("uses the reader's time zone, which can move the date", () => {
    const ms = Date.UTC(2019, 10, 6, 1, 19)
    expect(editTime(ms, 'en', 'Pacific/Auckland')).toEqual({ time: '2:19 pm', date: 'November 6, 2019' })
  })

  it('follows the language it is given', () => {
    const shown = editTime(Date.UTC(2019, 10, 6, 13, 19), 'fr', 'UTC')
    expect(shown.date).toBe('6 novembre 2019')
    expect(shown.time).toBe('13:19')
  })
})
