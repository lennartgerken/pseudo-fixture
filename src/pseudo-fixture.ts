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
            !this.readyFixtures[fixtureName] &&
            !this.waitForPreparation.has(fixtureName)
        ) {
            this.waitForPreparation.add(fixtureName)

            const setup = definition.setup
            const params = exportParams(setup)

            for (const param of params) {
                if (!this.readyFixtures[param]) await this.prepareFixture(param)
            }

            this.readyFixtures[fixtureName] = await setup(this.readyFixtures)
            if (definition.teardown)
                this.teardownsToRun.push(definition.teardown)

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
        for (const current of this.teardownsToRun) await this.run(current)

        this.readyFixtures = {}
        this.teardownsToRun = []
        this.waitForPreparation.clear()
    }
}
