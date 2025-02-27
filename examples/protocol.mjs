export class Network {
    send(data) {
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
        this._network.send('hello');
    }

    sendBye() {
        this._network.send('bye');
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
