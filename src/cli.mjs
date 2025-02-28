#!/usr/bin/env node

import { glob } from "glob";
import path from "path";
import chalk from "chalk";
import { fileURLToPath } from "url";
import { testRegistry } from "./index.mjs";
import cliArgs from 'command-line-parser';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function findTestFiles(dir) {
    return await glob([
            `${dir}/**/*.test.{js,mjs}`,
            `${dir}/**/test.*.{js,mjs}`,
            `${dir}/**/test*.{js,mjs}`,
        ], { 
            nocase: true, 
            ignore: [`${dir}/**/node_modules/**`] 
        }
    );
}


async function execFixture(fixture) {
    if (fixture.hasOwnProperty('value')) {
        return fixture;
    }

    for (const ref of fixture.refs) {
        await execFixture(ref);
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
        if (fixture.scope != scope || fixture.hasOwnProperty('value')) {
            continue;
        }

        await execFixture(fixture);
    }
}


function tearDownFixtures(scope, fixtures) {
    for (const fixture of fixtures) {
        if (fixture.scope != scope || !fixture.hasOwnProperty('value')) {
            continue;
        }

        if (fixture.isGen) {
            try {
                fixture.gen.next();
            } catch (e) {
                console.warn(chalk.bgYellow(' WARN '), `The fixture ${fixture.name} generator tear down failure`, e.stack);
            }
        }

        delete fixture.value;
        tearDownFixtures(scope, fixture.refs);
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


function getTestsNum(tests) {
    return Array.from(tests.values()).reduce((sum, item) => sum + (item.params? item.params.length: 1), 0);
}


async function collectStuff(testFiles) {
    const registries = new Map();

    for (const file of testFiles) {
        process.stdout.write(chalk.blue(`    Collecting tests in ${file}... `));
        try {
            await import(path.resolve(file));
            console.log(chalk.magenta(`${getTestsNum(testRegistry.tests)} found`));

            registries.set(file, {
                tests: new Map(testRegistry.tests), 
                fixtures: new Map(testRegistry.fixtures),
                markers: new Map(testRegistry.markers)
            });
            testRegistry.tests.clear();
            testRegistry.fixtures.clear();
        } catch(error) {
            throw new Error(`Error loading test file: ${error.message}`);
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


function printHelp() {
    console.log(
`ECMATest (JSTest) is the pytest-like testing framework for JavaScript built on to of Jest.

Usage: jstest [OPTIONS]

Options:
    --dir DIR  The directory to start search from (default: ./)
    --help     Show help message and exit`);
}


async function main() {
    async function execTest(testMeta, params) {
        await setupFixtures('session', testMeta.fixtures);
        await setupFixtures('module', testMeta.fixtures);
        await setupFixtures('function', testMeta.fixtures);
        const fixtureValues = Object.fromEntries(testMeta.fixtures.map(f => [f.name, f.value]));
        let result = null;
        if (params) {
            result = await runTest(() => testMeta.fn({ ...fixtureValues }, ...params));
        } else {
            result = await runTest(() => testMeta.fn({ ...fixtureValues }));
        }

        tearDownFixtures('function', testMeta.fixtures);
        if (result.status === "passed") {
            params? process.stdout.write(chalk.green("✓ ")): console.log(chalk.green("✓"));
            ++passed;
        } else {
            params? process.stdout.write(chalk.red("✗ ")): console.log(chalk.red("✗"));
            ++failed;
            failures.push({test: testMeta.name, params, error: result.error});
        }
    }

    function tearDownSessionFixtures(regestries) {
        for (const [_, registry] of regestries) {
            tearDownFixtures('session', registry.fixtures.values());
        }
    }

    const {dir=process.cwd(), help=false} = cliArgs();
    if (help) {
        printHelp()
        return;
    }

    console.log(chalk.blue("🔍 Discovering tests..."));
    const testFiles = await findTestFiles(dir);

    if (testFiles.length === 0) {
        console.log(chalk.yellow("No test files found."));
        return;
    }

    console.log(chalk.blue(`    Found ${testFiles.length} test files`));

    let passed = 0;
    let failed = 0;
    const failures = [];

    const regestries = await collectStuff(testFiles);
    for (const [file, registry] of regestries) {
        for (const [testName, testMeta] of registry.tests) {
            resolveTestFixtures(testMeta, registry);
        }
    }

    try {
        for (const [file, registry] of regestries) {
            console.log(chalk.cyan(`\nRunning tests in ${file}`));
            try {
                for (const [testName, testMeta] of registry.tests) {
                    process.stdout.write(`    ${testName}: `);
                    if (!testMeta.params) {
                        await execTest(testMeta);
                        continue;
                    }

                    for (const params of testMeta.params) {
                        await execTest(testMeta, params);
                    }
                    console.log();
                }
            } finally {
                tearDownFixtures('module', registry.fixtures.values());
            }
        }
    } finally {
        tearDownSessionFixtures(regestries);
    }

    console.log(chalk.blue("\nTest Summary:"));
    console.log(chalk.green(`    Passed: ${passed}`));
    console.log(chalk.red(`    Failed: ${failed}`));

    if (failures.length > 0) {
        console.log(chalk.red("\nFailures:"));
        failures.forEach((failure) => {
            console.log(chalk.red(`\n${failure.test}${failure.params? `   (${failure.params})` : ""}`));
            console.log(chalk.red(`    ${failure.error.message}`));
            console.log(failure.error.stack);
        });
        return 1;
    }
}


try {
    process.exit(await main());
} catch (error) {
    console.error(chalk.red("Test runner error:", error.stack));
    process.exit(1);
}
