import { expect, test, describe } from 'vitest'
import { PseudoFixture } from '../dist/index'

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
                setup: ({ f2 }) => {
                    return f1Value + f2
                }
            },
            f2: {
                setup: () => {
                    return f2Value
                }
            },
            f3: {
                setup: () => {
                    expect.fail()
                    return 'f3'
                }
            }
        })

        const actual = await pseudoFixture.run(({ f1 }) => {
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
                setup: () => {
                    setupCount++
                    return setupCount
                }
            }
        })

        await pseudoFixture.run(({ f1: _f1 }) => {})
        await pseudoFixture.run(({ f1: _f1 }) => {})

        expect(setupCount).toBe(1)
    })

    test('use circular fixtures', async () => {
        const pseudoFixture = new PseudoFixture<{ f1: string; f2: string }>({
            f1: {
                setup: ({ f2 }) => {
                    return f2
                }
            },
            f2: {
                setup: ({ f1 }) => {
                    return f1
                }
            }
        })

        await expect(pseudoFixture.run(({ f1: _ }) => {})).rejects.toThrow(
            "Fixture 'f1' is used as circular dependency"
        )
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
                setup: () => {
                    return f1Value
                },
                teardown: ({ f1, f3 }) => {
                    actual = f1 + f3 + f1TeardownValue
                }
            },
            f2: {
                setup: () => {
                    return 'f2'
                },
                teardown: () => {
                    expect.fail()
                }
            },
            f3: {
                setup: () => {
                    return f3Value
                },
                teardown: () => {
                    f3TeardownRun = true
                }
            }
        })

        await pseudoFixture.run(({ f1: _f1 }) => {})
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
                setup: ({ f2: _f2, f3: _f3 }) => {
                    return ''
                },
                teardown: () => {
                    actualOrder.push(f1TeardownValue)
                }
            },
            f2: {
                setup: () => {
                    return ''
                },
                teardown: ({ f4: _f4 }) => {
                    actualOrder.push(f2TeardownValue)
                }
            },
            f3: {
                setup: () => {
                    return ''
                },
                teardown: ({ f4: _f4 }) => {
                    actualOrder.push(f3TeardownValue)
                }
            },
            f4: {
                setup: () => {
                    return ''
                },
                teardown: () => {
                    actualOrder.push(f4TeardownValue)
                }
            }
        })

        await pseudoFixture.run(({ f1: _f1 }) => {})
        await pseudoFixture.runTeardown()

        expect(actualOrder).toEqual(exptectedOrder)
    })

    test('await using', async () => {
        let teardownRun = false

        {
            await using pseudoFixture = new PseudoFixture<{
                f1: string
            }>({
                f1: {
                    setup: () => {
                        return 'F1'
                    },
                    teardown: () => {
                        teardownRun = true
                    }
                }
            })

            await pseudoFixture.run(({ f1: _f1 }) => {})
        }

        expect(teardownRun).toBeTruthy()
    })
})

test('simple setup', async () => {
    const f1Value = 'f1'
    const f2Value = 'f2'

    const pseudoFixture = new PseudoFixture<{
        f1: string
        f2: string
    }>({
        f1: ({ f2 }) => {
            return f1Value + f2
        },
        f2: () => {
            return f2Value
        }
    })

    const actual = await pseudoFixture.run(({ f1 }) => {
        return f1
    })

    expect(actual).toBe(f1Value + f2Value)
})

test('full run', async () => {
    let setupCount = 0
    let teardownCount = 0

    const pseudoFixture = new PseudoFixture<{
        f1: string
    }>({
        f1: {
            setup: () => {
                setupCount++
                return ''
            },
            teardown: () => {
                teardownCount++
            }
        }
    })

    await pseudoFixture.run(({ f1: _f1 }) => {})
    await pseudoFixture.run(({ f1: _f1 }) => {})
    await pseudoFixture.fullRun(({ f1: _f1 }) => {})

    expect(setupCount).toBe(2)
    expect(teardownCount).toBe(2)
})

test('reset', async () => {
    let setupCounter = 0

    const pseudoFixture = new PseudoFixture<{
        f1: number
    }>({
        f1: {
            setup: () => {
                setupCounter++
                return setupCounter
            }
        }
    })

    await pseudoFixture.run(({ f1: _f1 }) => {})
    await pseudoFixture.runTeardown()
    await pseudoFixture.run(({ f1: _f1 }) => {})

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
                setup: ({ o1, o2 }) => {
                    return o1 + o2
                }
            }
        },
        { o1: o1Default, o2: o2Default }
    )

    expect(
        await pseudoFixture.run(({ f1 }) => {
            return f1
        })
    ).toBe(o1Default + o2Default)

    expect(
        await pseudoFixture.fullRun(
            ({ f1 }) => {
                return f1
            },
            {
                o1: o1Edit
            }
        )
    ).toBe(o1Edit + o2Default)
})

test('undefined return from setup', async () => {
    let setupCalls = 0

    const pseudoFixture = new PseudoFixture<{ a: undefined }>({
        a: {
            setup: () => {
                setupCalls++
                return undefined
            }
        }
    })

    await pseudoFixture.run(async ({ a }) => {
        expect(a).toBeUndefined()
    })

    await pseudoFixture.run(({ a }) => {
        expect(a).toBeUndefined()
    })

    expect(setupCalls).toBe(1)
})
