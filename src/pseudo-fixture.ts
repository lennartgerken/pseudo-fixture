import { exportParams } from './export-params.js'

type Definitions<Fixtures, Options> = {
    [Key in keyof Fixtures]: {
        setup: (fixtures: Fixtures & Options) => Promise<Fixtures[Key]>
        teardown?: (fixtures: Fixtures & Options) => Promise<void>
    }
}

export class PseudoFixture<Fixtures extends object, Options extends object> {
    protected definitions: Definitions<Fixtures, Options>
    protected options: Options
    protected readyFixtures: any
    protected teardownsToRun: ((
        fixtures: Fixtures & Options
    ) => Promise<void>)[]

    private waitForPreparation: Set<string>

    constructor(definitions: Definitions<Fixtures, Options>, options: Options) {
        this.definitions = definitions
        this.options = options
        this.readyFixtures = options
        this.teardownsToRun = []
        this.waitForPreparation = new Set()
    }

    protected async prepareFixture(fixtureName: string) {
        if (
            Object.keys(this.definitions).includes(fixtureName) &&
            !this.readyFixtures[fixtureName] &&
            !this.waitForPreparation.has(fixtureName)
        ) {
            this.waitForPreparation.add(fixtureName)

            const definition = this.definitions[fixtureName]
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

    async run(callback: (fixtures: Fixtures & Options) => Promise<void>) {
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
