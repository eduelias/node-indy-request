/**
 * This example depends on 3 trustee(authorized key pairs on the ledger).
 * Indy docker pools will need 2 additional trustees added before this example can be run.
 * */

const IndyReq = require('..');
const bs58 = require('bs58');
const nacl = require('tweetnacl');
const util = require('util');
const sodium = require('libsodium-wrappers');

const trustees = [
  '000000000000000000000000Steward1',
  '000000000000000000000000Steward2',
  '000000000000000000000000Steward3',
  '000000000000000000000000Steward4',
  // -- Trustees 
  '000000000000000000000000Trustee1',
  '00000000000000000000000Eduardo10'
  // -- Others
  // '000000000000000000000000Trustee2',  
  // '00000000000000000000000000000012',
  // '000000000000000000000000Steward5',
  // '000000000000000000000000Steward6',
  // '000000000000000000000000Steward7',
  // '00000000000000000000000000000012',
  // '00000000000000000000000000000013',
  // '0000000000000000000000000Eduardo'
]

async function main() {
  await sodium.ready;

  let dockerNode = IndyReq({
    // localPool, first line of the docker pool genesis file with client_ip set to 127.0.0.1
    genesisTxn:
      '{"reqSignature":{},"txn":{"data":{"data":{"alias":"Node1","blskey":"4N8aUNHSgjQVgkpm8nhNEfDf6txHznoYREg9kirmJrkivgL4oSEimFF6nsQ6M41QvhM2Z33nves5vfSn9n1UwNFJBYtWVnHYMATn76vLuL3zU88KyeAYcHfsih3He6UHcXDxcaecHVz6jhCYz1P2UZn2bDVruL5wXpehgBfBaLKm3Ba","blskey_pop":"RahHYiCvoNCtPTrVtP7nMC5eTYrsUA8WjXbdhNc8debh1agE9bGiJxWBXYNFbnJXoXhWFMvyqhqhRoq737YQemH5ik9oL7R4NTTCz2LEZhkgLJzB3QRQqJyBNyv7acbdHrAT8nQ9UkLbaVL9NBpnWXBTw4LEMePaSHEw66RzPNdAX1","client_ip":"127.0.0.1","client_port":9702,"node_ip":"127.0.0.1","node_port":9701,"services":["VALIDATOR"]},"dest":"Gw6pDLhcBcoQesN72qfotTgFa7cbuqZpkX3Xo6pLhPhv"},"metadata":{"from":"Th7MpTaRZVRYnPiabds81Y"},"type":"0"},"txnMetadata":{"seqNo":1,"txnId":"fea82e10e894419fe2bea7d96296a6d46f50f93f9eeda954ec461b2ed2950b62"},"ver":"1"}',
  });

  let toBeOnboarded = nacl.sign.keyPair.fromSeed(
    Buffer.from('00000000000000000000000Eduardo10', 'utf8') // <<-- Change this guy if you want a new transaction
    // Buffer.from ('00000000000000000000000000000002', 'utf8')
  );

  // // generate authorized key pairs
  let trustee1 = nacl.sign.keyPair.fromSeed(
    Buffer.from(trustees[0], 'utf8')
  );
  // // let trustee2 = nacl.sign.keyPair.fromSecretKey(
  // //   bs58.decode(
  // //     '2nRbhTm1nVdH8TL6NumgqZ7GAbSF4XLWXpXXzmwrmzWRuj3z9WiPSaRXc8Yc5uFoCoWzeRRGGWec7ANTmsHvvSUo'
  // //   )
  // // );
  // let trustee2 = nacl.sign.keyPair.fromSeed(
  //   Buffer.from('000000000000000000000000Steward2', 'utf8')
  // )
  // let trustee3 = nacl.sign.keyPair.fromSeed(
  //   Buffer.from('000000000000000000000000Steward3', 'utf8')
  // );
  // let trustee4 = nacl.sign.keyPair.fromSeed(
  //   Buffer.from('000000000000000000000000Steward4', 'utf8')
  // );

  // create did from public key
  let my1DID = bs58.encode(Buffer.from(toBeOnboarded.publicKey.slice(0, 16)));
  let my1Verkey = bs58.encode(Buffer.from(toBeOnboarded.publicKey)); // create verkey to be authorized on the ledger.

  let trustee1DID = bs58.encode(Buffer.from(trustee1.publicKey.slice(0, 16)));
  // let trustee2DID = bs58.encode(Buffer.from(trustee2.publicKey.slice(0, 16)));
  // let trustee3DID = bs58.encode(Buffer.from(trustee3.publicKey.slice(0, 16)));
  // let trustee4DID = bs58.encode(Buffer.from(trustee4.publicKey.slice(0, 16)));

  // authorize nym on the ledger with trustee role
  console.log('Anchor NYM');

  let aml = {
    'operation': {
        'type': IndyReq.type.TXN_AUTHOR_AGREEMENT_AML,
        'version': '1.0',
        'aml': {
            'eula': "Included in the EULA for the product being used",
            'service_agreement': "Included in the agreement with the service provider managing the transaction",
            'click_agreement': "Agreed through the UI at the time of submission",
            'session_agreement': "Agreed at wallet instantiation or login"
        },
        'amlContext': "http://aml-context-descr"
    },    
    'identifier': trustee1DID,
    'reqId': Math.round(new Date().getTime()/1000), //1514304094738044,
    'protocolVersion': 2    
}

  for (const trustee of trustees) {
    const keys = nacl.sign.keyPair.fromSeed(
      Buffer.from(trustee, 'utf8')
    )
    // console.log(trustee, bs58.encode(Buffer.from(keys.publicKey.slice(0, 16))), bs58.encode(Buffer.from(keys.secretKey)))
    aml = IndyReq.addSignature(aml, bs58.encode(Buffer.from(keys.publicKey.slice(0, 16))), keys.secretKey)
  }

  // nymTxn = IndyReq.addSignature(nymTxn, trustee1DID, trustee1.secretKey);
  // nymTxn = IndyReq.addSignature(nymTxn, trustee2DID, trustee2.secretKey);
  // nymTxn = IndyReq.addSignature(nymTxn, trustee3DID, trustee3.secretKey);
  // nymTxn = IndyReq.addSignature(nymTxn, trustee4DID, trustee4.secretKey);

  console.log(JSON.stringify(aml, null, 2));

  dockerNode.close();
}
main().catch(console.error);
