# ECMATest (JSTest)

Embrace the modern test-making vibe. Inspired by amazing pytest and built on top of Jest.

```shell
npm install ecmatest
```

After installation, the `jstest` command will be available in your environment. 
This command automatically searches for test files in your current directory and all subdirectories, 
following these filename patterns:

```javascript
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
```

## API

### fixture

Fixture is what one uses to setup a test. 
Fixtures can be chained by referencing them as formal parameters by other fixtures or tests.
But note fixture function has to use object destructuring syntax.
The fixture definition order doesn't matter. Fixtures can have scopes `function`, `module`, `session`.

Fixtures are lazily instantiated - they're only evaluated when referenced directly or indirectly by a test. 
This applies transitively to all fixture dependencies. 
Broader-scoped fixtures can not reference narrower-scoped ones.

Fixtures can be generators. This is how one can implement tear down. In the example below, the `fakeTimers` 
fixture mocks system timers during test execution and restores real timers afterward. Everything above the `yield` keyword is the setup section, and everything below is the teardown section.

Fixtures are executed according scope as 1. session, 2. module, 3. function. 
Note that session-scoped fixtures persist even after the current test module completes. 
This means fixture side effects can spread across modules - for example, 
if you set the `fakeTimers` fixture scope to `session`, timers will remain mocked until the entire test session finishes.

Currently, you can only reference fixtures from the same module. 
(Future plans include adding `conftest.mjs` config files to make global 
fixtures available and improve session scope functionality).

```javascript
import { fixture, test, createAutospec, jestFakeTimers, jestMocker } from 'ecmatest';


fixture(function theBeginning() {
    return new Date(0);
}, {scope: 'module'});


fixture(function* fakeTimers({theBeginning}) {
    const fakeTimers = jestFakeTimers();
    fakeTimers.useFakeTimers();
    fakeTimers.setSystemTime(theBeginning);
    yield fakeTimers;
    fakeTimers.useRealTimers();
}, {scope: 'module'});


fixture(function networkMock({ mocker }) {
    const mock = createAutospec(Network.prototype);
    mock.recv = mocker.fn(() => 'failure');
    // or
    // mock.recv.mockReturnValue('failure');
    return mock;
});


fixture(function mocker() {
    return jestMocker();
}, {scope: 'session'})


fixture(function sut({ networkMock }) {
    return new Protocol(networkMock);
});
```

### test

Tests are declared via `test` decorator and refer fixtures in the same way as [fixtures](#fixture).
Tests can use `expect` just as you would use in Jest.

```javascript
import { expect } from 'expect';


test("Send hello", ({ sut, networkMock }) => {
    sut.sendHello();
    expect(networkMock.send).toBeCalledWith('hello');
});


test("Fake timers test", ({fakeTimers, theBeginning}) => {
    expect(new Date()).toEqual(theBeginning);

    fakeTimers.advanceTimersByTime(60000);
    expect(new Date()).toEqual(new Date(60000));
});

```

### parametrize

Tests can be parametrized.

```javascript
test(
    "Multiplication with various inputs",
    parameterize(
        [2, 3, 6],
        [4, 4, 16],
        [0, 5, 0]
    )(function testMultiply({ sut }, a, b, expected) {
        expect(sut.multiply(a, b)).toBe(expected);
    })
);
```

### jest wrappers

To mock ECMAScript class or an Object one can use `createAutospec`. 
For classes, use `createAutospec(SomeClass.prototype)`; For objects use `createAutospec(someObject)` directly.

Under the hood, this uses Jest's mocking functionality. 
The implementation is straightforward, as shown below. 
The mocks are compatible with `expect` since they are Jest mocks and provide 
the API documented in the Jest [documentation](https://jestjs.io/docs/mock-function-api#methods).

Object returned by `jestMocker` has the interface described [here](https://jestjs.io/docs/jest-object#mock-functions) in the Jest docs.
For `fakeTimers` see [this](https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig). 
Note that out of the box the only `advanceTimers` (provided by jest `ModernFakeTimers` class) is available. 
But it's possible to create `LegacyFakeTimers` in the same way it's done for modern timers, though the config is slighly different.

```javascript
import jestFT from '@jest/fake-timers';


export function jestMocker() {
    return new jestMock.ModuleMocker(globalThis);
};


export function jestFakeTimers(config={ global, config: {} }) {
    return new jestFT.ModernFakeTimers(config);
}


export function createAutospec(obj) {
    const mocker = jestMocker();
    return mocker.generateFromMetadata(mocker.getMetadata(obj));
}
```

> [!NOTE]
> The object returned by `jestMocker()` has these methods: `clearAllMocks()`, `resetAllMocks()`, `restoreAllMocks()`. 
> These methods only affect mocks created by that specific mocker instance. 
> In practice, they're rarely needed in this paradigm since new mocks are created for 
> each test while old ones are destroyed during teardown.
> They may only be useful for `module` and `session` scoped mocks.

## What's next...

1. Implement `conftest.mjs` feature
2. Make Jest runner
3. Add fixture parametrization from within test setup
4. Add hooks
5. Add markers feature

See examples in `./examples` folder.
