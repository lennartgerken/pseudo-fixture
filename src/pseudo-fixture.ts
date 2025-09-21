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
    protected waitForPreparation: Set<string>

    constructor(definitions: Definitions<Fixtures>) {
        this.definitions = definitions
        this.readyFixtures = {}
        this.teardownsToRun = []
        this.waitForPreparation = new Set()
    }

    protected async prepareFixture(fixtureName: string) {
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
                if (
                    Object.keys(this.definitions).includes(param) &&
                    !this.readyFixtures[param]
                )
                    await this.prepareFixture(param)
            }

            this.readyFixtures[fixtureName] = await setup(this.readyFixtures)
            if (definition.teardown)
                this.teardownsToRun.push(definition.teardown)

            this.waitForPreparation.delete(fixtureName)
        }
    }

    async run(callback: (fixtures: Fixtures) => Promise<void>) {
        for (const param of exportParams(callback))
            await this.prepareFixture(param)

        await callback(this.readyFixtures)
    }

    async runTeardown() {
        for (const current of this.teardownsToRun) {
            await this.run(current)
        }
    }
}
