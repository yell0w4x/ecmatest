// Assertion functions
export class Assert {
    static equal(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Assertion Error: ${message}\nExpected: ${expected}\nActual: ${actual}`);
        }
    }

    static notEqual(actual, expected, message = '') {
        if (actual === expected) {
            throw new Error(`Assertion Error: ${message}\nExpected: not ${expected}\nActual: ${actual}`);
        }
    }

    static true(value, message = '') {
        if (!value) {
            throw new Error(`Assertion Error: ${message}\nExpected: true\nActual: ${value}`);
        }
    }

    static false(value, message = '') {
        if (value) {
            throw new Error(`Assertion Error: ${message}\nExpected: false\nActual: ${value}`);
        }
    }
}