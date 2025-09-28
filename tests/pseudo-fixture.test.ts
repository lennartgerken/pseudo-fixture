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

    test('reuse fixture', async () => {
        let setupCount = 0

        const pseudoFixture = new PseudoFixture<{
            f1: number
        }>({
            f1: {
                setup: async () => {
                    setupCount++
                    return setupCount
                }
            }
        })

        await pseudoFixture.run(async ({ f1: _f1 }) => {})
        await pseudoFixture.run(async ({ f1: _f1 }) => {})

        expect(setupCount).toBe(1)
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

test('full run', async () => {
    let setupCount = 0
    let teardownCount = 0

    const pseudoFixture = new PseudoFixture<{
        f1: string
    }>({
        f1: {
            setup: async () => {
                setupCount++
                return ''
            },
            teardown: async () => {
                teardownCount++
            }
        }
    })

    await pseudoFixture.run(async ({ f1: _f1 }) => {})
    await pseudoFixture.fullRun(async ({ f1: _f1 }) => {})

    expect(setupCount).toBe(2)
    expect(teardownCount).toBe(2)
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

test('options', async () => {
    const o1Default = 'o1'
    const o2Default = 'o2'
    const o1Edit = 'o1.1'

    const pseudoFixture = new PseudoFixture<
        {
            f1: string
        },
        { o1: string; o2: string }
    >(
        {
            f1: {
                setup: async ({ o1, o2 }) => {
                    return o1 + o2
                }
            }
        },
        { o1: o1Default, o2: o2Default }
    )

    expect(
        await pseudoFixture.run(async ({ f1 }) => {
            return f1
        })
    ).toBe(o1Default + o2Default)

    expect(
        await pseudoFixture.fullRun(
            async ({ f1 }) => {
                return f1
            },
            {
                o1: o1Edit
            }
        )
    ).toBe(o1Edit + o2Default)
})
