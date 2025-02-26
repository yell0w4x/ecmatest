#!/usr/bin/env node

import { glob } from "glob";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { testRegistry } from "./index.mjs";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function findTestFiles(pattern) {
    return await glob([
            `${pattern}/**/*.test.[m]js`,
            `${pattern}/**/test.*.[m]js`,
            `${pattern}/**/test*.[m]js`,
        ], { 
            nocase: true, 
            ignore: [`${pattern}/**/node_modules/**`] 
        }
    );
}


async function execFixture(fixture) {
    if (fixture.hasOwnProperty('value')) {
        return fixture;
    }

    for (const ref of fixture.refs) {
        execFixture(ref);
    }

    const refValues = Object.fromEntries(fixture.refs.map(ref => [ref.name, ref.value]));
    if (fixture.isGen) {
        fixture.gen = fixture.fn({...refValues});
        const genValue = fixture.gen.next();
        if (genValue.done) {
            console.warn(chalk.bgYellow(' WARN '), `The fixture ${fixture.name} generator is exhausted while tests setup. Is it done intentionally?`);
        }
        fixture.value = genValue.value;
    } else {
        fixture.value = await fixture.fn({...refValues});
    }

    return fixture;
}


async function setupFixtures(scope, fixtures) {
    for (const fixture of fixtures) {
        if (fixture.scope != scope) {
            continue;
        }

        execFixture(fixture);
    }
}


function tearDownFixtures(scope, fixtures) {
    for (const fixture of fixtures) {
        if (fixture.scope != scope) {
            continue;
        }

        if (fixture.isGen && fixture.hasOwnProperty('value')) {
            try {
                fixture.gen.next();
            } catch (e) {
                console.warn(chalk.bgYellow(' WARN '), `The fixture ${fixture.name} generator tear down failure`, e.stack);
            }
        } 
    }
}

async function runTest(testFn) {
    try {
        await testFn();
        return { status: "passed" };
    } catch (error) {
        return { status: "failed", error };
    }
}


async function collectStuff(testFiles) {
    const registries = new Map();

    for (const file of testFiles) {
        console.log(chalk.cyan(`\nCollecting tests in ${file}`));
        try {
            await import(path.resolve(file));
            registries.set(file, {
                tests: new Map(testRegistry.tests), 
                fixtures: new Map(testRegistry.fixtures),
                markers: new Map(testRegistry.markers)
            });
            testRegistry.tests.clear();
            testRegistry.fixtures.clear();
        } catch(error) {
            console.error(chalk.red(`Error loading test file: ${error.message}`, error.stack));
            process.exit(1);
        }
    }

    return await connectFixtures(registries);
}

function compareScope(lhv, rhv) {
    if (lhv == rhv) { return 0; }
    if (lhv == 'function' && (rhv == 'module' || rhv == 'session')) { return -1; }
    if (lhv == 'module' && rhv == 'session') { return -1; }
    return 1;
}

async function connectFixtures(registries) {
    for (const [file, registry] of registries) {
        const fixtures = registry.fixtures;
        for (const [fixtureName, fixtureMeta] of fixtures) {
            for (const param of fixtureMeta.params) {
                if (!await fixtures.has(param)) {
                    throw new Error(`Fixture ${fixtureName} refrences unresolved parameter ${param}`);
                }

                const refrencedFixture = await fixtures.get(param);
                if (fixtureMeta == refrencedFixture) {
                    throw new Error(`Fixture ${fixtureName} refrences itself`);
                }

                if (compareScope(fixtureMeta.scope, refrencedFixture.scope) > 0) {
                    throw new Error(`Fixture ${fixtureName} having scope ${fixtureMeta.scope} can't refrence fixture ${refrencedFixture.name} having narrower scope ${refrencedFixture.scope}`);
                }

                if (refrencedFixture.params.includes(fixtureMeta.name)) {
                    throw new Error(`Cross reference between ${fixtureName} and ${refrencedFixture.name} fixtures found`);
                }

                fixtureMeta.refs.push(refrencedFixture);
            }
        }
    }

    return registries;
}


function resolveTestFixtures(testMeta, registry) {
    const fixtureRefs = [];
    for (const fixtureName of testMeta.fixtures) {
        if (!registry.fixtures.has(fixtureName)) {
            throw new Error(`Test ${testMeta.name} refrences unresolved fixture ${fixtureName}`);
        }

        fixtureRefs.push(registry.fixtures.get(fixtureName));
    }
    testMeta.fixtures = fixtureRefs;
    return fixtureRefs;
}


async function runTests() {
    const testDir = process.argv[2] || process.cwd();

    console.log(chalk.blue("🔍 Discovering tests..."));
    const testFiles = await findTestFiles(testDir);

    if (testFiles.length === 0) {
        console.log(chalk.yellow("No test files found."));
        process.exit(0);
    }

    console.log(chalk.blue(`Found ${testFiles.length} test files`));

    let passed = 0;
    let failed = 0;
    const failures = [];

    const regestries = await collectStuff(testFiles);
    for (const [file, registry] of regestries) {
        for (const [testName, testMeta] of registry.tests) {
            resolveTestFixtures(testMeta, registry);
        }
    }

    for (const [file, registry] of regestries) {
        console.log(chalk.cyan(`\nRunning tests in ${file}`));

        try {
            // Run discovered tests
            for (const [testName, testMeta] of registry.tests) {
                process.stdout.write(`  ${testName}: `);

                if (testMeta.params) {
                    for (const params of testMeta.params) {
                        await setupFixtures('session', testMeta.fixtures);
                        await setupFixtures('module', testMeta.fixtures);
                        await setupFixtures('function', testMeta.fixtures);
                        const fixtureValues = Object.fromEntries(testMeta.fixtures.map(f => [f.name, f.value]));
                        const result = await runTest(() => testMeta.fn({ ...fixtureValues }, ...params));
                        tearDownFixtures('function', testMeta.fixtures);
                        if (result.status === "passed") {
                            process.stdout.write(chalk.green("✓ "));
                            ++passed;
                        } else {
                            process.stdout.write(chalk.red("✗ "));
                            ++failed;
                            failures.push({test: testMeta.name, params, error: result.error});
                        }
                    }
                    process.stdout.write("\n");
                } else {
                    await setupFixtures('session', testMeta.fixtures);
                    await setupFixtures('module', testMeta.fixtures);
                    await setupFixtures('function', testMeta.fixtures);
                    const fixtureValues = Object.fromEntries(testMeta.fixtures.map(f => [f.name, f.value]));
                    const result = await runTest(() => testMeta.fn({ ...fixtureValues }));
                    tearDownFixtures('function', testMeta.fixtures);
                    if (result.status === "passed") {
                        console.log(chalk.green("✓"));
                        ++passed;
                    } else {
                        console.log(chalk.red("✗"));
                        ++failed;
                        failures.push({test: testMeta.name, error: result.error});
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red(`Error loading test file: ${error.message}`, error.stack));
            process.exit(1);
        } finally {
            tearDownFixtures('module', registry.fixtures.values());
        }
    }

    for (const [file, registry] of regestries) {
        tearDownFixtures('session', registry.fixtures.values());
    }

    console.log(chalk.blue("\nTest Summary:"));
    console.log(chalk.green(`  Passed: ${passed}`));
    console.log(chalk.red(`  Failed: ${failed}`));

    if (failures.length > 0) {
        console.log(chalk.red("\nFailures:"));
        failures.forEach((failure) => {
            console.log(
                chalk.red(
                    `\n${failure.test}${
                        failure.params ? ` (${failure.params})` : ""
                    }`
                )
            );
            console.log(chalk.red(`  ${failure.error.message}`));
            console.log(failure.error.stack);
        });
        process.exit(1);
    }
}

runTests().catch((error) => {
    console.error(chalk.red("Test runner error:", error.stack));
    process.exit(1);
});
