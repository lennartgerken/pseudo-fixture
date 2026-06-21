import * as acorn from 'acorn'

type Setup<Fixtures, Options extends object, Key extends keyof Fixtures> = (
    fixtures: Fixtures & Options
) => Promise<Fixtures[Key]> | Fixtures[Key]

type Teardown<Fixtures, Options extends object> = (
    fixtures: Fixtures & Options
) => Promise<void> | void

export type Definitions<Fixtures, Options extends object> = {
    [Key in keyof Fixtures]:
        | {
              setup: Setup<Fixtures, Options, Key>
              teardown?: Teardown<Fixtures, Options>
              global?: boolean
          }
        | Setup<Fixtures, Options, Key>
}

type IsSameType<Type1, Type2> = [Type1] extends [Type2]
    ? [Type2] extends [Type1]
        ? true
        : false
    : false

type ConstructorArgs<Fixtures, Options extends object = object> =
    IsSameType<Options, object> extends true
        ? [definitions: Definitions<Fixtures, Options>]
        : [definitions: Definitions<Fixtures, Options>, defaultOptions: Options]

type FullRunArgs<Fixtures, Return, Options extends object = object> =
    IsSameType<Options, object> extends true
        ? [callback: (fixtures: Fixtures & Options) => Promise<Return> | Return]
        : [
              callback: (
                  fixtures: Fixtures & Options
              ) => Promise<Return> | Return,
              options?: { [Key in keyof Options]?: Options[Key] }
          ]

const exportParams = <T extends object>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: (obj: T, ...args: any[]) => unknown
) => {
    const props: (keyof T)[] = []
    const setProps = (
        pattern: acorn.ArrowFunctionExpression | acorn.FunctionDeclaration
    ) => {
        const param = pattern.params[0]
        if (param) {
            if (param.type === 'ObjectPattern') {
                param.properties.forEach((prop) => {
                    if (prop.type === 'Property') {
                        if (prop.key.type === 'Identifier')
                            props.push(prop.key.name as keyof T)
                    }
                })
            }
        }
    }

    const fnParse = acorn.parse(`(${fn.toString()})`, {
        ecmaVersion: 'latest'
    })

    const statement = fnParse.body[0]
    if (statement) {
        if (statement.type === 'ExpressionStatement') {
            const expression = statement.expression
            if (expression.type === 'ArrowFunctionExpression') {
                setProps(expression)
            }
        } else if (statement.type === 'FunctionDeclaration') {
            setProps(statement)
        }
    }

    return props
}

function assertFixturesPrepared<T extends object>(
    value: Partial<T>,
    keys: readonly (keyof T)[]
): asserts value is T {
    for (const key of keys) {
        if (!(key in value)) {
            throw new Error(`Fixture '${String(key)}' was not prepared`)
        }
    }
}

export class PseudoFixture<
    Fixtures extends object,
    Options extends object = object
> {
    protected definitions: Definitions<Fixtures, Options>
    protected defaultOptions: Options
    protected readyFixtures: Partial<Fixtures & Options>
    protected globalFixtureKeys: Set<keyof (Fixtures & Options)>
    protected teardownsToRun: {
        fixtureName: keyof (Fixtures & Options)
        teardown: Teardown<Fixtures, Options>
    }[]
    protected waitForPreparation: Set<keyof Definitions<Fixtures, Options>>

    /**
     * Creates a PseudoFixture.
     * @param args[0] Defines how the fixtures are created.
     * @param args[1] Default options.
     */
    constructor(...args: ConstructorArgs<Fixtures, Options>) {
        this.definitions = args[0]
        this.defaultOptions = (args[1] as Options) ?? {}
        this.readyFixtures = { ...this.defaultOptions }
        this.globalFixtureKeys = new Set()
        this.teardownsToRun = []
        this.waitForPreparation = new Set()
    }

    protected async prepareFixture(
        fixtureName: keyof Definitions<Fixtures, Options> | keyof Options,
        parentIsGlobal = false
    ) {
        const isDefinitionsKey = (
            key: keyof Definitions<Fixtures, Options> | keyof Options
        ): key is keyof Definitions<Fixtures, Options> => {
            return Object.keys(this.definitions).includes(key as string)
        }

        const isSetupFunction = (
            definition: Definitions<Fixtures, Options>[keyof Fixtures]
        ): definition is Setup<Fixtures, Options, keyof Fixtures> => {
            return typeof definition === 'function'
        }

        if (!isDefinitionsKey(fixtureName)) return

        if (
            Object.prototype.hasOwnProperty.call(
                this.readyFixtures,
                fixtureName
            )
        ) {
            if (parentIsGlobal) this.globalFixtureKeys.add(fixtureName)
        } else {
            if (this.waitForPreparation.has(fixtureName))
                throw new Error(
                    `Fixture '${String(fixtureName)}' is used as circular dependency`
                )

            const definition = this.definitions[fixtureName]
            if (!definition)
                throw new Error(
                    `No definition defined for fixture '${String(fixtureName)}'`
                )

            this.waitForPreparation.add(fixtureName)

            const definitionIsSetupFunction = isSetupFunction(definition)
            const isGlobal = !!(
                parentIsGlobal ||
                (!definitionIsSetupFunction && definition.global)
            )

            if (isGlobal) this.globalFixtureKeys.add(fixtureName)

            const setup = definitionIsSetupFunction
                ? definition
                : definition.setup
            const teardown = !definitionIsSetupFunction
                ? definition.teardown
                : undefined

            let params = exportParams(setup)
            if (teardown)
                params = params.concat(
                    exportParams(teardown).filter(
                        (value) => value !== fixtureName
                    )
                )
            for (const param of params)
                await this.prepareFixture(param, isGlobal)

            if (teardown)
                this.teardownsToRun.unshift({
                    fixtureName,
                    teardown
                })

            assertFixturesPrepared(this.readyFixtures, params)

            const result: Fixtures[typeof fixtureName] = await setup(
                this.readyFixtures
            )
            ;(this.readyFixtures as Partial<Fixtures>)[fixtureName] = result

            this.waitForPreparation.delete(fixtureName)
        }
    }

    /**
     * Prepares all fixtures required by the callback function and executes the callback with them.
     * @param callback Function to run inside the PseudoFixture
     * @returns Return value of the callback
     */
    async run<T, CA extends unknown[]>(
        callback: (fixtures: Fixtures & Options, ...args: CA) => Promise<T> | T,
        ...args: CA
    ): Promise<T> {
        const params = exportParams(callback)
        for (const param of params) await this.prepareFixture(param)

        assertFixturesPrepared(this.readyFixtures, params)
        return callback(this.readyFixtures, ...args)
    }

    protected async genericFullRun<T>(
        teardown: () => Promise<void>,
        ...args: FullRunArgs<Fixtures, T, Options>
    ): Promise<T> {
        await teardown()
        const options = (args[1] as Options) ?? this.defaultOptions
        this.readyFixtures = {
            ...this.readyFixtures,
            ...options
        }
        try {
            return await this.run(args[0])
        } finally {
            await teardown()
        }
    }

    /**
     * Prepares all fixtures required by the callback function and executes the callback with them.
     * Before and after the callback the teardown is run.
     * @param args[0] Function to run inside the PseudoFixture.
     * @param args[1] Override default options.
     * @returns Return value of the callback
     */
    fullRun<T>(...args: FullRunArgs<Fixtures, T, Options>): Promise<T> {
        return this.genericFullRun(() => this.runTeardown(), ...args)
    }

    /**
     * Prepares all fixtures required by the callback function and executes the callback with them.
     * Before and after the callback the global teardown is run.
     * @param args[0] Function to run inside the PseudoFixture.
     * @param args[1] Override default options.
     * @returns Return value of the callback
     */
    fullGlobalRun<T>(...args: FullRunArgs<Fixtures, T, Options>): Promise<T> {
        return this.genericFullRun(() => this.runGlobalTeardown(), ...args)
    }

    /**
     * Runs all local teardown functions of used fixtures.
     */
    async runTeardown() {
        for (const current of this.teardownsToRun) {
            if (!this.globalFixtureKeys.has(current.fixtureName)) {
                const params = exportParams(current.teardown)
                assertFixturesPrepared(this.readyFixtures, params)
                await current.teardown(this.readyFixtures)
            }
        }

        for (const key of Object.keys(this.readyFixtures) as Array<
            keyof (Fixtures & Options)
        >) {
            if (!this.globalFixtureKeys.has(key)) delete this.readyFixtures[key]
        }
        this.readyFixtures = { ...this.defaultOptions, ...this.readyFixtures }
        this.teardownsToRun = this.teardownsToRun.filter(({ fixtureName }) =>
            this.globalFixtureKeys.has(fixtureName)
        )
        this.waitForPreparation.clear()
    }

    /**
     * Runs all teardown functions of used fixtures.
     */
    async runGlobalTeardown() {
        for (const current of this.teardownsToRun) {
            const params = exportParams(current.teardown)
            assertFixturesPrepared(this.readyFixtures, params)
            await current.teardown(this.readyFixtures)
        }

        this.readyFixtures = { ...this.defaultOptions }
        this.teardownsToRun = []
        this.waitForPreparation.clear()
        this.globalFixtureKeys.clear()
    }

    async [Symbol.asyncDispose]() {
        await this.runTeardown()
    }
}
