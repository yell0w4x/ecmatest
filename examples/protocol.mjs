export class Network {
    send(data) {
        return 10;
    }

    recv() {
        return 'data';
    }
}

export class Protocol {
    constructor(network) {
        this._network = network;
    }

    sendHello() {
        if (this._network.send('hello') == 0) {
            throw Error('Nothing has been sent');
        }
    }

    sendBye() {
        if (this._network.send('bye') == 0) {
            throw Error('Nothing has been sent');
        }
    }

    recvMessage() {
        const message = this._network.recv();
        if (message == 'failure') {
            throw new Error('Some error occurred');
        }

        return message;
    }
}

export default { Network, Protocol };
