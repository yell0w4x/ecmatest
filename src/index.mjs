import jestMock from 'jest-mock';
import { parseScript } from "esprima";


// Global test registry
export const testRegistry = {
    tests: new Map(),
    fixtures: new Map(),
    markers: new Map(),
};

function getFuncParams(func) {
    const ast = parseScript(`(${func.toString()})`);
    const params = ast.body[0].expression.params[0]?.properties || [];
    console.log(params.map(param => param.key.name));
    return params.map(param => param.key.name);
}

// Test function - replaces @test decorator
export function test(name, fn) {
    const testName = typeof name === "function" ? fn.name : name;
    const testFn = typeof name === "function" ? name : fn;

    const meta = {
        name: testName,
        fn: testFn,
        markers: [],
        fixtures: getFuncParams(fn),
        params: testFn.params || null,
    };

    testRegistry.tests.set(testName, meta);
    return testFn;
}

// Fixture function - replaces @fixture decorator
export function fixture(fn, {scope, autouse}={scope: 'function', autouse: false}) {
    const isGen = fn.constructor.name == 'GeneratorFunction';
    const fixtureName = fn.name;
    const meta = {
        name: fixtureName, 
        fn, 
        isGen, 
        scope,
        params: getFuncParams(fn),
        autouse,
        refs: []
    };
    testRegistry.fixtures.set(fixtureName, meta);
    return fn;
}

// Mark function - replaces @mark decorator
export function mark(name, value = true) {
    return function (fn) {
        const test = testRegistry.tests.get(fn.name);
        if (test) {
            test.markers.push({ name, value });
        }
        return fn;
    };
}

// Parameterize function - replaces @parameterize decorator
export function parameterize(...params) {
    return function (testFn) {
        const wrappedTest = testFn;
        wrappedTest.params = params;
        return wrappedTest;
    };
}

export function createAutospec(obj) {
    const mocker = new jestMock.ModuleMocker(globalThis);
    return mocker.generateFromMetadata(mocker.getMetadata(obj));
}


export class Patch {
    constructor(target, prop, mock) {
        this._target = target;
        this._prop = prop;
        this._mock = mock;
        this._original = target[prop];
    }

    enter() {
        this._target[this._prop] = this._mock;
    }

    exit() {
        this._target[this._prop] = this._original;
    }

    original() {
        return this._original;
    }

    target() {
        return this._target;
    }

    prop() {
        return this._prop;
    }

    mock() {
        return this._mock;
    }
}