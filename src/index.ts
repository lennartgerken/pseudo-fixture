import * as acorn from 'acorn'

type Setup<Fixtures, Options extends object, Key extends keyof Fixtures> = (
    fixtures: Fixtures & Options
) => Promise<Fixtures[Key]> | Fixtures[Key]

type Teardown<Fixtures, Options extends object> = (
    fixtures: Fixtures & Options
) => Promise<void> | void

type Definitions<Fixtures, Options extends object> = {
    [Key in keyof Fixtures]:
        | {
              setup: Setup<Fixtures, Options, Key>
              teardown?: Teardown<Fixtures, Options>
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

    const fnParse = acorn.parse(fn.toString(), {
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

export class PseudoFixture<
    Fixtures extends object,
    Options extends object = object
> {
    protected definitions: Definitions<Fixtures, Options>
    protected defaultOptions: Options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readyFixtures: any
    protected teardownsToRun: Teardown<Fixtures, Options>[]
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
        this.teardownsToRun = []
        this.waitForPreparation = new Set()
    }

    protected async prepareFixture(
        fixtureName: keyof Definitions<Fixtures, Options> | keyof Options
    ) {
        const isDefinitionsKey = (
            key: keyof Definitions<Fixtures, Options> | keyof Options
        ): key is keyof Definitions<Fixtures, Options> => {
            return Object.keys(this.definitions).includes(key as string)
        }

        if (isDefinitionsKey(fixtureName)) {
            const isSetupFunction = (
                definition: Definitions<Fixtures, Options>[keyof Fixtures]
            ): definition is Setup<Fixtures, Options, keyof Fixtures> => {
                return typeof definition === 'function'
            }

            const definition = this.definitions[fixtureName]

            if (
                definition &&
                !Object.prototype.hasOwnProperty.call(
                    this.readyFixtures,
                    fixtureName
                ) &&
                !this.waitForPreparation.has(fixtureName)
            ) {
                this.waitForPreparation.add(fixtureName)

                const setup = isSetupFunction(definition)
                    ? definition
                    : definition.setup
                const teardown = !isSetupFunction(definition)
                    ? definition.teardown
                    : undefined

                let params = exportParams(setup)
                if (teardown) params = params.concat(exportParams(teardown))
                for (const param of params) await this.prepareFixture(param)

                if (teardown) this.teardownsToRun.unshift(teardown)

                this.readyFixtures[fixtureName] = await setup(
                    this.readyFixtures
                )

                this.waitForPreparation.delete(fixtureName)
            }
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
        for (const param of exportParams(callback))
            await this.prepareFixture(param)

        return callback(this.readyFixtures, ...args)
    }

    /**
     * Prepares all fixtures required by the callback function and executes the callback with them.
     * Before and after the callback the teardown is run.
     * @param args[0] Function to run inside the PseudoFixture.
     * @param args[1] Override default options.
     * @returns Return value of the callback
     */
    async fullRun<T>(...args: FullRunArgs<Fixtures, T, Options>): Promise<T> {
        await this.runTeardown()
        const options = (args[1] as Options) ?? this.defaultOptions
        this.readyFixtures = { ...this.defaultOptions, ...options }
        try {
            return await this.run(args[0])
        } finally {
            await this.runTeardown()
        }
    }

    /**
     * Runs all teardown functions of used fixtures.
     */
    async runTeardown() {
        for (const current of this.teardownsToRun)
            await current(this.readyFixtures)

        this.readyFixtures = { ...this.defaultOptions }
        this.teardownsToRun = []
        this.waitForPreparation.clear()
    }

    async [Symbol.asyncDispose]() {
        await this.runTeardown()
    }
}
