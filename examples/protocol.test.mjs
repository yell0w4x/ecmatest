import { fixture, test, createAutospec, jestFakeTimers, jestMocker } from '../index.mjs';
import { Protocol, Network } from "./protocol.mjs";
import { expect } from 'expect';


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


fixture(function network({ mocker }) {
    const mock = createAutospec(Network.prototype);
    // mock.recv.mockReturnValue('failure');
    mock.recv = mocker.fn(() => 'failure');
    return mock;
});


fixture(function mocker() {
    return jestMocker();
}, {scope: 'session'})


fixture(function sut({ network }) {
    return new Protocol(network);
});


test("Send hello", ({ sut, network }) => {
    sut.sendHello();
    expect(network.send).toBeCalledWith('hello');
});


test("Receive must throw in case of failure", ({ sut, network }) => {
    expect(() => sut.recvMessage()).toThrow('Some error occurred');
    expect(network.recv).toBeCalled();
});


test("Fake timers test", ({fakeTimers, theBeginning}) => {
    expect(new Date()).toEqual(theBeginning);

    fakeTimers.advanceTimersByTime(60000);
    expect(new Date()).toEqual(new Date(60000));
});
