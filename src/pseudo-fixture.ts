import { exportParams } from './export-params'

type Definitions<Fixtures> = {
    [Key in keyof Fixtures]: {
        setup: (fixtures: Fixtures) => Promise<Fixtures[Key]>
        teardown?: (fixtures: Fixtures) => Promise<void>
    }
}

export class PseudoFixture<Fixtures extends object> {
    protected definitions: Definitions<Fixtures>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readyFixtures: any
    protected teardownsToRun: ((fixtures: Fixtures) => Promise<void>)[]
    protected waitForPreparation: Set<keyof Definitions<Fixtures>>

    /**
     * Creates a PseudoFixture.
     * @param definitions Defines how the fixtures are created.
     */
    constructor(definitions: Definitions<Fixtures>) {
        this.definitions = definitions
        this.readyFixtures = {}
        this.teardownsToRun = []
        this.waitForPreparation = new Set()
    }

    protected async prepareFixture(fixtureName: keyof Definitions<Fixtures>) {
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

            this.readyFixtures[fixtureName] = await setup(this.readyFixtures)

            this.waitForPreparation.delete(fixtureName)
        }
    }

    /**
     * Prepares all fixtures required by the callback function and executes the callback with them.
     * @param callback Function to run inside the PseudoFixture
     * @returns Return value of the callback
     */
    async run<T>(callback: (fixtures: Fixtures) => Promise<T>): Promise<T> {
        for (const param of exportParams(callback))
            await this.prepareFixture(param)

        return await callback(this.readyFixtures)
    }

    /**
     * Runs all teardown functions of used fixtures.
     */
    async runTeardown() {
        for (const current of this.teardownsToRun)
            await current(this.readyFixtures)

        this.readyFixtures = {}
        this.teardownsToRun = []
        this.waitForPreparation.clear()
    }
}
