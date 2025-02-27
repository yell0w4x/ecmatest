# ECMATest (JSTest)

Embrace the modern way vibe of making tests. Inspired by amazing pytest and built on top of jest.

```shell
npm install ecmatest
```

After that `jstest` command should be available. 
It searches for test files starting from current folder and all the subfolders.
The filename patterns to search are as follows. The `dir` can be specified by command line.

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
Fixtures can be chained by refrencing as them as formal parameters by other fixtures or tests.
But note fixture function should use object unpacking syntax.
The fixture definition order doesn't matter. Fixtures can have scopes `function`, `module`, `session`.
The only really used fixures are instantiated. 
It means if you don't refer a fixture in test it will never be be evaluated. 
This applies transitively to all fixture deps. The wider scoped fixtures can refer to narrower ones.

Fixtures can be generators. This is how one can implement tear down. As you can see below is the `fakeTimers` fixture.
That when is used will be mock system timers and in the test end will restore real timers.
Everything above `yield` keyword is the setup section and everything that goes below is tear down section.

Fixtures are executed according scope as 1. session, 2. module, 3. function. 
Note that session scoped fixtures will be alive even when current test module is finished. 
The fixture's side effect can spread across modules as e.g. if one sets `fakeTimers` fixture scope to `session` 
the timers will be faked until test session finished.

Note it's only possible to refer fixtures from same module. 
(May be I'll add `conftest.mjs` config files to make global fixtures available and session scope more reasonable).

```javascript
import { fixture, createAutospec, jestFakeTimers, jestMocker } from 'ecmatest';


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
Tests can use `expect` as in usual way in jest.

```javascript
import { expect } from 'expect';

test("Send hello", ({ sut, networkMock }) => {
    sut.sendHello();
    expect(networkMock.send).toBeCalledWith('hello');
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
To mock a class `createAutospec(SomeClass.prototype)`, to mock an object use it directly like `createAutospec(someObject)`.
Under the hood it uses jest mocker to create mocks. The implementation is below and quite simple.
They are compartible with `except` as they are jest mocks and 
provide api you can find out from jest [docs](https://jestjs.io/docs/mock-function-api#methods).

Object returned by `jestMocker` has the interface described [here](https://jestjs.io/docs/jest-object#mock-functions) in jest docs.
For `fakeTimers` see [this](https://jestjs.io/docs/jest-object#jestusefaketimersfaketimersconfig). 
Note that out of the box the only `advanceTimers` (provided by jest `ModernFakeTimers` class) are available. 
But it's possible to create `LegacyFakeTimers` in the same way it's done for modern timers. But note the config is bit different.


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

[!NOTE]
Object returned by `jestMocker()` has these methods: `clearAllMocks()`, `resetAllMocks()`, `restoreAllMocks()`. 
Please note they are related to this exact object, so the action applies only to the mocks created by this particular object. 
Actually in this paradigm they are likely not necessary as for new test invocation new mocks are created while old are destroyed in tear down phase. 
They can only have point for `module` and `session` scoped mocks.

## What's next...

1. Implement `conftest.mjs` feature.
2. Make jest runner.
3. Add fixture parametrization from within test setup.
4. Add markers feature.

See examples in `./examples` folder.
