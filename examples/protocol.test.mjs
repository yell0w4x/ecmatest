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


fixture(function networkMock({ mocker }) {
    const mock = createAutospec(Network.prototype);
    mock.recv = mocker.fn(() => 'failure');
    // or
    // mock.recv.mockReturnValue('failure');
    return mock;
});


fixture(function realNetworkWithOnlySendMocked({ mocker }) {
    const network = new Network();
    const sendMock = mocker.spyOn(network, 'send');
    sendMock.mockReturnValue(0);
    return [network, sendMock];
});


fixture(function mocker() {
    return jestMocker();
}, {scope: 'session'})


fixture(function sut({ networkMock }) {
    return new Protocol(networkMock);
});


fixture(function sutWithRealNetwork({ realNetworkWithOnlySendMocked }) {
    return new Protocol(realNetworkWithOnlySendMocked[0]);
});


test("Send hello", ({ sut, networkMock }) => {
    sut.sendHello();
    expect(networkMock.send).toBeCalledWith('hello');
});


test("Receive must throw in case of failure", ({ sut, networkMock }) => {
    expect(() => sut.recvMessage()).toThrow('Some error occurred');
    expect(networkMock.recv).toBeCalled();
});


test("Fake timers test", ({fakeTimers, theBeginning}) => {
    expect(new Date()).toEqual(theBeginning);

    fakeTimers.advanceTimersByTime(60000);
    expect(new Date()).toEqual(new Date(60000));
});


test('Send must throw if no data have been sent', ({ sutWithRealNetwork, realNetworkWithOnlySendMocked }) => {
    const [network, sendMock] = realNetworkWithOnlySendMocked;
    expect(network instanceof Network).toBeTruthy();
    expect(() => sutWithRealNetwork.sendBye()).toThrow('Nothing has been sent');
    expect(sendMock).toBeCalledWith('bye');
});