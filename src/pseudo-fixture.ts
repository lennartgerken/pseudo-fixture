import { exportParams } from './export-params'

type Definitions<Fixtures, Options extends object> = {
    [Key in keyof Fixtures]: {
        setup: (fixtures: Fixtures & Options) => Promise<Fixtures[Key]>
        teardown?: (fixtures: Fixtures & Options) => Promise<void>
    }
}

type IsExactly<T, U> = [T] extends [U]
    ? [U] extends [T]
        ? true
        : false
    : false

type ConstructorArgs<Fixtures, Options extends object = object> =
    IsExactly<Options, object> extends true
        ? [definitions: Definitions<Fixtures, Options>]
        : [definitions: Definitions<Fixtures, Options>, options: Options]

type FullRunArgs<Fixtures, Return, Options extends object = object> =
    IsExactly<Options, object> extends true
        ? [callback: (fixtures: Fixtures & Options) => Promise<Return>]
        : [
              callback: (fixtures: Fixtures & Options) => Promise<Return>,
              options?: { [Key in keyof Options]?: Options[Key] }
          ]

export class PseudoFixture<
    Fixtures extends object,
    Options extends object = object
> {
    protected definitions: Definitions<Fixtures, Options>
    protected options: Options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readyFixtures: any
    protected teardownsToRun: ((
        fixtures: Fixtures & Options
    ) => Promise<void>)[]
    protected waitForPreparation: Set<keyof Definitions<Fixtures, Options>>

    /**
     * Creates a PseudoFixture.
     * @param definitions Defines how the fixtures are created.
     */
    constructor(...args: ConstructorArgs<Fixtures, Options>) {
        this.definitions = args[0]
        this.options = (args[1] as Options) ?? {}
        this.readyFixtures = { ...this.options }
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
            const definition = this.definitions[fixtureName]

            if (
                definition &&
                definition.setup &&
                this.readyFixtures[fixtureName] === undefined &&
                !this.waitForPreparation.has(fixtureName)
            ) {
                this.waitForPreparation.add(fixtureName)

                const setup = definition.setup
                const teardown = definition.teardown

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
    async run<T>(
        callback: (fixtures: Fixtures & Options) => Promise<T>
    ): Promise<T> {
        for (const param of exportParams(callback))
            await this.prepareFixture(param)

        return await callback(this.readyFixtures)
    }

    /**
     * Prepares all fixtures required by the callback function and executes the callback with them.
     * Before and after the callback the teardown is run.
     * @param callback Function to run inside the PseudoFixture
     * @returns Return value of the callback
     */
    async fullRun<T>(...args: FullRunArgs<Fixtures, T, Options>): Promise<T> {
        await this.runTeardown()
        const options = (args[1] as Options) ?? this.options
        this.readyFixtures = { ...this.options, ...options }
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

        this.readyFixtures = { ...this.options }
        this.teardownsToRun = []
        this.waitForPreparation.clear()
    }
}
