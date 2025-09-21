import { expect, test } from 'vitest'
import { PseudoFixture } from '../src/index'

test('run', async () => {
    const f1Value = 'f1'
    const f2Value = 'f2'

    const pseudoFixture = new PseudoFixture<{ f1: string; f2: string }>({
        f1: {
            setup: async ({ f2 }) => {
                expect(f2).toBe(f2Value)
                return f1Value
            }
        },
        f2: {
            setup: async () => {
                return f2Value
            }
        }
    })

    await pseudoFixture.run(async ({ f1 }) => {
        expect(f1).toBe(f1Value)
    })
})
