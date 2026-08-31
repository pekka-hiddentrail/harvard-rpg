import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { effortScore } from '@harvard/engine'
import { loadContent } from '../src/index.ts'
import { representativeSectionHours } from '../src/workload.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..', '..', 'content')
const content = loadContent(root)

describe('representativeSectionHours', () => {
  it("averages CS50's real section slots to 2.75h (all six are 165 minutes)", () => {
    const hours = representativeSectionHours('cs50', content.slots)
    assert.ok(Math.abs(hours - 2.75) < 1e-9)
  })

  it('is 0 for a course with no section-type slots', () => {
    assert.equal(representativeSectionHours('no-such-course', content.slots), 0)
  })
})

describe('effortScore, joined against real sections', () => {
  it("CS50 reaches the decided effort of 7 once its real section length is supplied", () => {
    const cs50 = content.courses.find((c) => c.courseCode === 'cs50')!
    const sectionHours = representativeSectionHours('cs50', content.slots)
    assert.equal(effortScore(cs50, sectionHours), 7)
  })
})
