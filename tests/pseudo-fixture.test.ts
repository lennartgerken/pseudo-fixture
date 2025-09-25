import { expect, test, describe } from 'vitest'
import { PseudoFixture } from '../src/index'

describe('run', () => {
    test('use fixtures', async () => {
        const f1Value = 'f1'
        const f2Value = 'f2'

        const pseudoFixture = new PseudoFixture<{
            f1: string
            f2: string
            f3: string
        }>({
            f1: {
                setup: async ({ f2 }) => {
                    return f1Value + f2
                }
            },
            f2: {
                setup: async () => {
                    return f2Value
                }
            },
            f3: {
                setup: async () => {
                    expect.fail()
                    return 'f3'
                }
            }
        })

        const actual = await pseudoFixture.run(async ({ f1 }) => {
            return f1
        })

        expect(actual).toBe(f1Value + f2Value)
    })

    test('use circular fixtures', async () => {
        const pseudoFixture = new PseudoFixture<{ f1: string; f2: string }>({
            f1: {
                setup: async ({ f2 }) => {
                    return f2
                }
            },
            f2: {
                setup: async ({ f1 }) => {
                    return f1
                }
            }
        })

        const actual = await pseudoFixture.run(async ({ f1 }) => {
            return f1
        })

        expect(actual).toBe(undefined)
    })
})

describe('teardown', () => {
    test('use fixtures', async () => {
        const f1Value = 'f1'
        const f3Value = 'f3'
        const f1TeardownValue = 'Teardown'

        let actual = ''
        let f3TeardownRun = false

        const pseudoFixture = new PseudoFixture<{
            f1: string
            f2: string
            f3: string
        }>({
            f1: {
                setup: async () => {
                    return f1Value
                },
                teardown: async ({ f1, f3 }) => {
                    actual = f1 + f3 + f1TeardownValue
                }
            },
            f2: {
                setup: async () => {
                    return 'f2'
                },
                teardown: async () => {
                    expect.fail()
                }
            },
            f3: {
                setup: async () => {
                    return f3Value
                },
                teardown: async () => {
                    f3TeardownRun = true
                }
            }
        })

        await pseudoFixture.run(async ({ f1: _f1 }) => {})
        await pseudoFixture.runTeardown()

        expect(actual).toBe(f1Value + f3Value + f1TeardownValue)
        expect(f3TeardownRun).toBeTruthy()
    })

    test('order', async () => {
        const f1TeardownValue = 'f1'
        const f2TeardownValue = 'f2'
        const f3TeardownValue = 'f3'
        const f4TeardownValue = 'f4'

        const exptectedOrder = [
            f1TeardownValue,
            f3TeardownValue,
            f2TeardownValue,
            f4TeardownValue
        ]
        const actualOrder: string[] = []

        const pseudoFixture = new PseudoFixture<{
            f1: string
            f2: string
            f3: string
            f4: string
        }>({
            f1: {
                setup: async ({ f2: _f2, f3: _f3 }) => {
                    return ''
                },
                teardown: async () => {
                    actualOrder.push(f1TeardownValue)
                }
            },
            f2: {
                setup: async () => {
                    return ''
                },
                teardown: async ({ f4: _f4 }) => {
                    actualOrder.push(f2TeardownValue)
                }
            },
            f3: {
                setup: async () => {
                    return ''
                },
                teardown: async ({ f4: _f4 }) => {
                    actualOrder.push(f3TeardownValue)
                }
            },
            f4: {
                setup: async () => {
                    return ''
                },
                teardown: async () => {
                    actualOrder.push(f4TeardownValue)
                }
            }
        })

        await pseudoFixture.run(async ({ f1: _f1 }) => {})
        await pseudoFixture.runTeardown()

        expect(actualOrder).toEqual(exptectedOrder)
    })
})

test('reset', async () => {
    let setupCounter = 0

    const pseudoFixture = new PseudoFixture<{
        f1: number
    }>({
        f1: {
            setup: async () => {
                setupCounter++
                return setupCounter
            }
        }
    })

    await pseudoFixture.run(async ({ f1: _f1 }) => {})
    await pseudoFixture.runTeardown()
    await pseudoFixture.run(async ({ f1: _f1 }) => {})

    expect(setupCounter).toBe(2)
})
