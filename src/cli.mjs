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

async function setupFixtures(scope, testRegistry) {
    const fixtureValues = {};
    for (const [name, fixture] of testRegistry.fixtures) {
        if (fixture.scope != scope) {
            continue;
        }

        if (fixture.isGen) {
            fixture.gen = fixture.fn({...fixtureValues});
            const genValue = fixture.gen.next();
            if (genValue.done) {
                console.warn(chalk.bgYellow(' WARN '), `The fixture ${name} generator is exhausted while tests setup. Is it done intentionally?`);
            }
            fixtureValues[name] = genValue.value;
        } else {
            fixtureValues[name] = await fixture.fn({...fixtureValues});
        }
    }

    return fixtureValues;
}

function tearDownFixtures(scope, testRegistry) {
    for (const [name, fixture] of testRegistry.fixtures) {
        if (fixture.scope != scope) {
            continue;
        }

        if (fixture.isGen) {
            try {
                fixture.gen.next();
            } catch (e) {
                console.warn(chalk.bgYellow(' WARN '), `The fixture ${name} generator tear down failure`, e.stack);
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

    return registries;
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
    console.log(regestries);
    // const sessionFixtures = await setupFixtures('session');
    const sessionFixtures = {};
    for (const [file, registry] of regestries) {
        console.log(chalk.cyan(`\nRunning tests in ${file}`));

        try {
            const moduleFixtures = await setupFixtures('module', registry);
            // Run discovered tests
            for (const [testName, testMeta] of registry.tests) {
                    process.stdout.write(`  ${testMeta.name}: `);

                const functionFixtures = await setupFixtures('function', registry);
                if (testMeta.params) {
                    // Run parameterized test
                    for (const params of testMeta.params) {
                        const result = await runTest(() => testMeta.fn({ ...functionFixtures, ...moduleFixtures, ...sessionFixtures }, ...params));
                        tearDownFixtures('function', registry);
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
                    // Run regular test
                    const result = await runTest(() => testMeta.fn({ ...functionFixtures, ...moduleFixtures, ...sessionFixtures }));
                    tearDownFixtures('function', registry);
                    if (result.status === "passed") {
                        console.log(chalk.green("✓"));
                        passed++;
                    } else {
                        console.log(chalk.red("✗"));
                        failed++;
                        failures.push({test: testMeta.name, error: result.error});
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red(`Error loading test file: ${error.message}`, error.stack));
            process.exit(1);
        } finally {
            tearDownFixtures('module', registry);
        }
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
    console.error(chalk.red("Test runner error:", error));
    process.exit(1);
});
