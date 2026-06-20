# pseudo-fixture

`pseudo-fixture` contains a small helper class for creating reusable fixture structures.

## Installation

```
npm i -D pseudo-fixture
```

## Basic Usage

`PseudoFixture` takes a fixtures type and optionally an options type.
You define how each fixture is created with setup functions and can optionally add teardown functions.
Setup and teardown functions can depend on other fixtures. Dependencies are handled automatically.
You can then run callbacks through `PseudoFixture`. Any fixtures used by the callback are automatically prepared and passed in.

## Fixture Definitions

- **setup**: A function that specifies how the fixture is created.

- **teardown?**: A function that specifies how the fixture is cleaned up after it has been used.

- **global?**: A flag that specifies whether a fixture is global. When set to `true`, the fixture is not cleaned up during normal teardown and remains available until the global teardown is executed.

## Methods of PseudoFixture

- **run(callback)**: Prepares all fixtures required by the callback function and executes the callback with them.

- **fullRun(callback, options?)**: Prepares all fixtures required by the callback function and executes the callback with them. Before and after the callback the teardown is run.

- **fullGlobalRun(callback, options?)**: Prepares all fixtures required by the callback function and executes the callback with them. Before and after the callback the global teardown is run.

- **runTeardown()**: Runs all local teardown functions of used fixtures.

- **runGlobalTeardown()**: Runs all teardown functions of used fixtures.

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
                        setup: () => browser.newContext(),
                        teardown: ({ context }) => context.close()
                    },
                    page: ({ context }) => context.newPage(),
                    request: ({ context }) => context.request,
                    user: {
                        setup: async ({ request, userData }) => {
                            await createUser(request, userData)
                            return userData
                        },
                        teardown: ({ request, user }) =>
                            deleteUser(request, user.username)
                    },
                    loginPage: async ({ page }) => {
                        const loginPage = new LoginPage(page)
                        await loginPage.goto()
                        return loginPage
                    },
                    transactionPage: async ({ user, page, loginPage }) => {
                        await loginPage.login(user)
                        return new TransactionPage(page)
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
        await use((callback, options) => {
            const pseudoFixture = createPseudoFixture()
            return pseudoFixture.fullRun(callback, options)
        })
    }
})
```

Now we can use the `PseudoFixture` inside our test functions. For example, we could have a test case where we create a transaction with our default user with role `"basic"` and after that approve the transaction with a second user with role `"approver"`. The creation of the users and the navigation is handled in the `PseudoFixture`.

```ts
test('Transaction workflow', async ({ runPseudoFixture }) => {
    const transactionID = await runPseudoFixture(({ transactionPage }) =>
        transactionPage.createTransaction()
    )

    await runPseudoFixture(
        ({ transactionPage }) =>
            transactionPage.approveTransaction(transactionID),
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
    const transactionID = await pseudoFixtureUser1.run(({ transactionPage }) =>
        transactionPage.createTransaction()
    )

    await runPseudoFixture(
        ({ transactionPage }) =>
            transactionPage.approveTransaction(transactionID),
        {
            userData: {
                username: 'user2',
                password: 'password',
                role: 'approver'
            }
        }
    )

    await pseudoFixtureUser1.run(({ transactionPage }) =>
        transactionPage.continueAfterApproval(transactionID)
    )
})

test.afterEach(() => pseudoFixtureUser1.runTeardown())
```

`PseudoFixture` objects are async disposables. If a `PseudoFixture` is only used within a single test, it can be created with `await using` to automatically run `teardown` when the object goes out of scope:

```ts
test('Transaction workflow', async ({
    createPseudoFixture,
    runPseudoFixture
}) => {
    await using pseudoFixtureUser1 = createPseudoFixture()

    const transactionID = await pseudoFixtureUser1.run(({ transactionPage }) =>
        transactionPage.createTransaction()
    )

    await runPseudoFixture(
        ({ transactionPage }) =>
            transactionPage.approveTransaction(transactionID),
        {
            userData: {
                username: 'user2',
                password: 'password',
                role: 'approver'
            }
        }
    )

    await pseudoFixtureUser1.run(({ transactionPage }) =>
        transactionPage.continueAfterApproval(transactionID)
    )
})
```

## License

This package is licensed under the [MIT License](./LICENSE).
