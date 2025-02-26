export class Network {
    send(data) {
        // console.log(`Sending ${data}...`);
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
}