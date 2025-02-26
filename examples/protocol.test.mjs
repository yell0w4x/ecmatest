import { fixture, test } from '../index.mjs';
import { Protocol, Network } from "./protocol.mjs";
// import axios from 'axios';
// import jest from 'jest';


// jest.mock('axios');

fixture(function* network() {
    yield new Network();
});


fixture(function* sut({ network }) {
    yield new Protocol(network);
});


// Basic test with fixture
test("Send hello", ({ sut }) => {
    sut.sendHello();
});
