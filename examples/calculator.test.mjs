import {
    test,
    fixture,
    mark,
    parameterize,
} from "../index.mjs";
import { expect } from 'expect';


// Simple Calculator class to test
class Calculator {
    add(a, b) {
        return a + b;
    }
    subtract(a, b) {
        return a - b;
    }
    multiply(a, b) {
        return a * b;
    }
    divide(a, b) {
        if (b === 0) throw new Error("Division by zero");
        return a / b;
    }
}


// Create calculator fixture
fixture(function* sut() {
    yield new Calculator();
});


// Basic test with fixture
test("Addition works correctly", ({ sut }) => {
    expect(sut.add(2, 3)).toBe(5);
});


// Test with marker
mark("slow")(
    test("Subtraction works correctly", ({ sut }) => {
        expect(sut.subtract(5, 3)).toBe(2);
    })
);


// Parameterized test
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


// Test that expects an error
test("Division by zero throws error", ({sut}) => {
    expect(() => sut.divide(10, 0)).toThrow('Division by zero');
});


// Test with async operation
test("Async calculator operation", async ({sut}) => {
    // Simulate async calculation
    const result = await new Promise((resolve) => {
        setTimeout(() => resolve(sut.add(5, 5)), 100);
    });
    expect(result).toBe(10);
});


// Multiple markers
mark("integration")(
    mark("slow")(
        test("Complex calculation sequence", ({ sut }) => {
            const result = sut.multiply(
                sut.add(5, 5),
                sut.subtract(10, 5)
            );
            expect(result).toBe(50);
        })
    )
);
