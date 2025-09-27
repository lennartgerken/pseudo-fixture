# pseudo-fixture

`pseudo-fixture` contains a small helper class for creating reusable fixture structures.

## Installation

```
npm i -D pseudo-fixture
```

## Example Usage in Playwright

You can, for example, use `pseudo-fixture` in Playwright to create a fixture structure for working in multiple contexts:\
Suppose we have an application with a login page and a transaction page. Transactions can be created by users with the role `"basic"` but only approved by users with the role `"approver"`.
We could create the following custom fixtures:\
Define the types used for the `PseudoFixture`:

```ts
// Defines what can be used inside the PseudoFixture.
export type PseudoFixtures = {
    context: BrowserContext
    page: Page
    request: APIRequestContext
    user: { username: string; password: string; role: string }
    loginPage: LoginPage
    transactionPage: TransactionPage
}

// Defines what can be configured for the PseudoFixture.
type PseudoOptions = {
    userData: { username: string; password: string; role: string }
}
```

Define the types used for the custom Playwright fixtures:

```ts
// Defines custom Playwright fixtures.
type Fixtures = {
    createPseudoFixture: (
        options?: PseudoOptions
    ) => PseudoFixture<PseudoFixtures>
    runPseudoFixture: <T>(
        callback: (fixtures: PseudoFixtures) => Promise<T>,
        options?: PseudoOptions
    ) => Promise<T>
}

// Defines custom Playwright options.
type Options = {
    defaultPseudoOptions: PseudoOptions
}
```

Extend the Playwright test object with the custom fixtures and create the `PseudoFixture`:

```ts
// Extends Playwright test.
export const test = base.extend<Fixtures & Options>({
    defaultPseudoOptions: [
        {
            userData: { username: 'user1', password: 'password', role: 'basic' }
        },
        { option: true }
    ],

    // Creates a function to generate new PseudoFixtures.
    // Every key of type PseudoFixtures needs a setup function to define how the data is created.
    // Optionally, a teardown function can be defined.
    createPseudoFixture: async ({ browser, defaultPseudoOptions }, use) => {
        await use((options) => {
            const optionsToUse = options || defaultPseudoOptions
            return new PseudoFixture<PseudoFixtures>({
                context: {
                    setup: async () => {
                        return await browser.newContext()
                    },
                    teardown: async ({ context }) => {
                        await context.close()
                    }
                },
                page: {
                    setup: async ({ context }) => {
                        return await context.newPage()
                    }
                },
                request: {
                    setup: async ({ context }) => {
                        return context.request
                    }
                },
                user: {
                    setup: async ({ request }) => {
                        await createUser(request, optionsToUse.userData)
                        return optionsToUse.userData
                    },
                    teardown: async ({ request }) => {
                        await deleteUser(
                            request,
                            optionsToUse.userData.username
                        )
                    }
                },
                loginPage: {
                    setup: async ({ page }) => {
                        const loginPage = new LoginPage(page)
                        await loginPage.goto()
                        return loginPage
                    }
                },
                transactionPage: {
                    setup: async ({ page, loginPage, user }) => {
                        await loginPage.login(user)
                        return new TransactionPage(page)
                    }
                }
            })
        })
    },

    // Creates a function to instantiate a PseudoFixture, run a callback, and then handle teardown.
    runPseudoFixture: async ({ createPseudoFixture }, use) => {
        await use(async (callback, options) => {
            const pseudoFixture = createPseudoFixture(options)
            const callbackValue = await pseudoFixture.run(callback)
            await pseudoFixture.runTeardown()
            return callbackValue
        })
    }
})
```

Now we can use the `PseudoFixture` inside our test functions. For example, we could have a testcase where we create a transaction with our default user with role `"basic"` and after that approve the transaction with a second user with role `"approver"`. The creation of the users and the navigation is handled in the `PseudoFixture`.

```ts
test('Transaction workflow', async ({ runPseudoFixture }) => {
    const transactionID = await runPseudoFixture(
        async ({ transactionPage }) => {
            return await transactionPage.createTransaction()
        }
    )

    await runPseudoFixture(
        async ({ transactionPage }) => {
            await transactionPage.approveTransaction(transactionID)
        },
        {
            userData: {
                username: 'user2',
                password: 'password',
                role: 'approver'
            }
        }
    )
})
```

Alternatively, we could also keep the `PseudoFixture` and run a second callback to continue the transaction after the approval:

```ts
let pseudoFixtureUser1: PseudoFixture<PseudoFixtures>

test.beforeEach(({ createPseudoFixture }) => {
    pseudoFixtureUser1 = createPseudoFixture()
})

test('Transaction workflow', async ({ runPseudoFixture }) => {
    const transactionID = await pseudoFixtureUser1.run(
        async ({ transactionPage }) => {
            return await transactionPage.createTransaction()
        }
    )

    await runPseudoFixture(
        async ({ transactionPage }) => {
            await transactionPage.approveTransaction(transactionID)
        },
        {
            userData: {
                username: 'user2',
                password: 'password',
                role: 'approver'
            }
        }
    )

    await pseudoFixtureUser1.run(async ({ transactionPage }) => {
        await transactionPage.continueAfterApproval(transactionID)
    })
})

test.afterEach(async () => {
    await pseudoFixtureUser1.runTeardown()
})
```

## License

This package is licensed under the [MIT License](./LICENSE).
