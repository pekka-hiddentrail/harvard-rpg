import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CourseId, CourseSlot, CourseSlotList, SectionId } from '../src/schema.ts'

const slot = {
  id: '050',
  section: '011',
  courseCode: 'cs50',
  type: 'section' as const,
  time: '09:00-11:45',
  days: ['Tue'] as const,
  size: 18,
  occupied: 0,
  attendance: 'mandatory' as const,
  demand: 6,
  instructor: 'Kevin Dooders',
}

describe('course and section identifiers', () => {
  it('preserves exactly three digits, including leading zeroes', () => {
    assert.equal(CourseId.parse('050'), '050')
    assert.equal(SectionId.parse('011'), '011')
    assert.throws(() => CourseId.parse(50))
    assert.throws(() => CourseId.parse('50'))
    assert.throws(() => SectionId.parse('0011'))
  })
})

describe('course slots', () => {
  it('accepts the authored six-digit composite identity and per-slot demand', () => {
    assert.deepEqual(CourseSlot.parse(slot), slot)
  })

  it('remains strict about obsolete or misspelled fields', () => {
    assert.throws(() => CourseSlot.parse({ ...slot, course: 'cs50' }))
    assert.throws(() => CourseSlot.parse({ ...slot, demand: 11 }))
  })

  it('rejects duplicate composite identifiers', () => {
    const result = CourseSlotList.safeParse([slot, { ...slot, instructor: 'Someone Else' }])
    assert.equal(result.success, false)
    if (!result.success) {
      assert.match(result.error.issues[0]?.message ?? '', /duplicate course slot identifier `050011`/)
    }
  })
})
