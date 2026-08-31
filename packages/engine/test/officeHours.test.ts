import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OfficeHour } from '../src/schema.ts'

describe('office hours', () => {
  it('accepts both open drop-ins and booked timed appointments', () => {
    assert.equal(
      OfficeHour.parse({
        type: 'officeHour',
        length: 'free',
        booked: false,
        days: ['Thu'],
        time: '19:00-23:00',
        location: 'Annenberg Hall',
        demand: 6,
      }).length,
      'free',
    )
    assert.equal(
      OfficeHour.parse({
        type: 'officeHour',
        length: '20 minutes',
        booked: true,
        days: ['Tue'],
        time: '09:00-16:00',
        location: "Preceptor's office, One Bow Street",
        demand: 5,
      }).length,
      '20 minutes',
    )
  })

  it('rejects misspelled durations and out-of-range demand', () => {
    const base = {
      type: 'officeHour',
      booked: true,
      days: ['Tue'],
      time: '09:00-16:00',
      location: 'One Bow Street',
      demand: 5,
    }
    assert.throws(() => OfficeHour.parse({ ...base, length: '20 mintues' }))
    assert.throws(() => OfficeHour.parse({ ...base, length: '20 minutes', demand: 11 }))
  })
})
