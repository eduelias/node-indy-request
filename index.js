const bs58 = require('bs58');
const sodium = require('libsodium-wrappers');
const zmq = require('zeromq');
const EventEmitter = require('events');
const serializeForSignature = require('./serializeForSignature');

const type = {
  NODE: '0',
  NYM: '1',
  TXN_AUTHOR_AGREEMENT: '4',
  TXN_AUTHOR_AGREEMENT_AML: '5',
  ATTRIB: '100',
  SCHEMA: '101',
  CRED_DEF: '102',
  POOL_UPGRADE: '109',
  NODE_UPGRADE: '110',
  POOL_CONFIG: '111',
  GET_TXN: '3',
  GET_TXN_AUTHOR_AGREEMENT: '6',
  GET_TXN_AUTHOR_AGREEMENT_AML: '7',
  GET_ATTR: '104',
  GET_NYM: '105',
  GET_SCHEMA: '107',
  GET_CLAIM_DEF: '108',
};

const role = {
  TRUSTEE: '0',
  STEWARD: '2',
  TRUST_ANCHOR: '101',
  ROLE_REMOVE: '',
};

const ledger = {
  POOL: 0,
  DOMAIN: 1,
  CONFIG: 2,
};

function sign(serialized, signKey) {
  const signature = sodium
    .crypto_sign(Buffer.from(serialized, 'utf8'), signKey)
    .slice(0, 64);
  return bs58.encode(Buffer.from(signature));
}

function addSignature(data, did, signKey) {
  const serialized = serializeForSignature(data);

  const newSignature = {};
  newSignature[did] = sign(serialized, signKey);

  return Object.assign({}, data, {
    signatures: Object.assign({}, data.signatures || {}, newSignature),
  });
}

function IndyReq(conf) {
  const reqs = {};
  const api = new EventEmitter();

  const initZmqSocket = (async function() {
    await sodium.ready;
    if (typeof conf.timeout !== 'number') {
      conf.timeout = 1000 * 60;
    }
    if (conf.genesisTxn) {
      if (typeof conf.genesisTxn === 'string') {
        conf.genesisTxn = JSON.parse(conf.genesisTxn);
      }
      const dest = bs58.decode(conf.genesisTxn.txn.data.dest);
      conf.serverKey = sodium.crypto_sign_ed25519_pk_to_curve25519(dest);
      conf.host = conf.genesisTxn.txn.data.data.client_ip;
      conf.port = conf.genesisTxn.txn.data.data.client_port;
    }
    const zsock = zmq.socket('dealer');

    const keypair = zmq.zmqCurveKeypair();
    zsock.identity = keypair.public;
    zsock.curve_publickey = keypair.public;
    zsock.curve_secretkey = keypair.secret;
    zsock.curve_serverkey = conf.serverKey;
    zsock.linger = 0; // TODO set correct timeout
    zsock.connect('tcp://' + conf.host + ':' + conf.port);

    zsock.on('message', function(msg) {
      try {
        const str = msg.toString('utf8');
        if (str === 'po') {
          api.emit('pong');
          return;
        }
        let data = JSON.parse(str);
        let reqId, err;
        switch (data.op) {
          case 'REQACK':
            reqId = data.reqId;
            if (reqs[reqId]) {
              reqs[reqId].ack = Date.now();
            }
            break;
          case 'REQNACK':
          case 'REJECT':
            reqId = data.reqId;
            err = new Error(data.reason);
            err.data = data;
            if (reqs[reqId]) {
              reqs[reqId].reject(err);
            } else {
              api.emit('error', err);
            }
            break;
          case 'REPLY':
            if (data.result && data.result.txn && data.result.txn.metadata) {
              reqId = data.result.txn.metadata.reqId;
            } else {
              reqId = data.result.reqId;
            }

            if (reqs[reqId]) {
              reqs[reqId].resolve(data);
              delete reqs[reqId];
            } else {
              let err = new Error('reqId not found: ' + reqId);
              err.data = data;
              api.emit('error', err);
            }
            break;
          default:
            err = new Error('op not handled: ' + data.op);
            err.data = data;
            api.emit('error', err);
        }
      } catch (err) {
        // TODO try MsgPack
        api.emit('error', err);
      }
    });
    return zsock;
  })();

  let checkTimeouts = setInterval(function() {
    Object.keys(reqs).forEach(function(reqId) {
      if (Date.now() - reqs[reqId].sent > conf.timeout) {
        reqs[reqId].reject(new Error('Timeout'));
        delete reqs[reqId];
      }
    });
  }, 1000);

  api.ping = async function ping() {
    const zsock = await initZmqSocket;
    zsock.send('pi');
  };

  api.newReqId = (function() {
    let id = 1;
    return function() {
      return id++;
    };
  })();

  api.send = async function send(data, options = {}) {
    const zsock = await initZmqSocket;

    if (!data.reqId) {
      data.reqId = api.newReqId();
    }

    if (options.signature || options.signatures) {
      let serialized = serializeForSignature(data);

      if (options.signature) {
        data.signature = sign(serialized, options.signature);
      }
      if (options.signatures) {
        data.signatures = data.signatures || {};
        for (const did of Object.keys(options.signatures)) {
          data.signatures[did] = sign(serialized, options.signatures[did]);
        }
      }
    }

    let p = new Promise(function(resolve, reject) {
      reqs[data.reqId] = {
        sent: Date.now(),
        ack: null,
        resolve: resolve,
        reject: reject,
      };
    });
    let msg = Buffer.from(JSON.stringify(data));
    zsock.send(msg);
    return p;
  };
  api.close = async function close() {
    clearInterval(checkTimeouts);
    const zsock = await initZmqSocket;
    zsock.close();
    Object.keys(reqs).forEach(function(reqId) {
      reqs[reqId].reject(new Error('Closed'));
      delete reqs[reqId];
    });
    api.emit('close');
  };
  return api;
}

module.exports = IndyReq;
module.exports.type = type;
module.exports.role = role;
module.exports.ledger = ledger;
module.exports.addSignature = addSignature;
