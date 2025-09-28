# pseudo-fixture

`pseudo-fixture` contains a small helper class for creating reusable fixture structures.

## Installation

```
npm i -D pseudo-fixture
```

## Basic Usage

`PseudoFixture` requires one type that specifies the fixtures. Optionally, you can pass a second type that specifies the options. The constructor must include at least a setup function for each fixture parameter. These functions define how the fixtures are created. Optionally, a teardown function can also be defined for each fixture.\
Each setup and teardown function can depend on other fixtures. Those dependencies are automatically prepared before the specific setup or teardown runs.\
If an options type is specified, the constructor also requires default values for the options. After setup, you can use the different methods of `PseudoFixture` to run callback functions. These callbacks can use all fixtures and options as parameters. When fixtures are used in the parameters, they are prepared (if they weren’t already in a previous run) and passed to the callback.

## Methods of PseudoFixture

- **run(callback)**: Prepares all fixtures required by the callback function and executes the callback with them.

- **fullRun(callback, options?)**: Prepares all fixtures required by the callback function and executes the callback with them. Before and after the callback the teardown is run.

- **runTeardown()**: Runs all teardown functions of used fixtures.

## Example Usage in Playwright

You can for example use `pseudo-fixture` in Playwright to create a fixture structure for working in multiple contexts:\
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
        defaultOptions?: PseudoOptions
    ) => PseudoFixture<PseudoFixtures, PseudoOptions>
    runPseudoFixture: <T>(
        callback: (fixtures: PseudoFixtures) => Promise<T>,
        options?: PseudoOptions
    ) => Promise<T>
}
```

Extend the Playwright test object with the custom fixtures and create the `PseudoFixture`:

```ts
// Extends Playwright test.
export const test = base.extend<Fixtures>({
    // Creates a function to generate new PseudoFixtures.
    // Every key of type PseudoFixtures needs a setup function to define how the data is created.
    // Optionally a teardown function can be defined.
    createPseudoFixture: async ({ browser }, use) => {
        await use((defaultOptions) => {
            return new PseudoFixture<PseudoFixtures, PseudoOptions>(
                {
                    context: {
                        setup: async () => {
                            return await browser.newContext()
                        },
                        teardown: async ({ context }) => {
                            console.log('close context')
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
                        setup: async ({ request, userData }) => {
                            await createUser(request, userData)
                            return userData
                        },
                        teardown: async ({ request, user }) => {
                            await deleteUser(request, user.username)
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
                        setup: async ({ user, page, loginPage }) => {
                            await loginPage.login(user)
                            return new TransactionPage(page)
                        }
                    }
                },
                defaultOptions || {
                    userData: {
                        username: 'user1',
                        password: 'password',
                        role: 'basic'
                    }
                }
            )
        })
    },

    // Creates a function that uses the fullRun method of PseudoFixture to run the callback and the teardown with the specified options.
    runPseudoFixture: async ({ createPseudoFixture }, use) => {
        await use(async (callback, options) => {
            const pseudoFixture = createPseudoFixture()
            return await pseudoFixture.fullRun(callback, options)
        })
    }
})
```

Now we can use the `PseudoFixture` inside our test functions. For example, we could have a test case where we create a transaction with our default user with role `"basic"` and after that approve the transaction with a second user with role `"approver"`. The creation of the users and the navigation is handled in the `PseudoFixture`.

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
