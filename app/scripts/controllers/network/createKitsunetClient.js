'use strict'

const EE = require('safe-event-emitter')

const PeerId = require('peer-id')
const PeerInfo = require('peer-info')
const pify = require('pify')

const { MAINNET_CODE } = require('./enums')

const mergeMiddleware = require('json-rpc-engine/src/mergeMiddleware')
const createBlockRefRewriteMiddleware = require('eth-json-rpc-middleware/block-ref-rewrite')
const createAsyncMiddleware = require('json-rpc-engine/src/createAsyncMiddleware')
const providerFromMiddleware = require('eth-json-rpc-middleware/providerFromMiddleware')
const createSliceMiddleware = require('eth-json-rpc-kitsunet-slice')
const scaffold = require('eth-json-rpc-middleware/scaffold')
const createVmMiddleware = require('eth-json-rpc-middleware/vm')

const utils = require('ethereumjs-util')
const createKitsunet = require('kitsunet')

module.exports = async function () {
  const id = await pify(PeerId.create)()
  const peerInfo = await pify(PeerInfo.create)(id)
  const clientId = peerInfo.id.toB58String()
  const identity = id.toJSON()
  const devMode = true

  const kitsunet = await createKitsunet({
    identity,
    libp2pAddrs: [
      // `/dns4/signaller.lab.metamask.io/tcp/443/wss/p2p-webrtc-star/ipfs/${clientId}`
      `/ip4/127.0.0.1/tcp/9090/ws/p2p-webrtc-star/ipfs/${clientId}`,
    ],
    NODE_ENV: devMode ? 'dev' : 'prod',
    sliceDepth: 10,
    // rpcUrl: 'http://localhost:8546',
    ethAddrs: [
      '0x52bc44d5378309ee2abf1539bf71de1b7d7be3b5',
      '0x6810e776880c02933d47db1b9fc05908e5386b96',
      '0x1d805bc00b8fa3c96ae6c8fa97b2fd24b19a9801',
    ],
    libp2pBootstrap: [
      '/ip4/127.0.0.1/tcp/30334/ws/ipfs/QmUA1Ghihi5u3gDwEDxhbu49jU42QPbvHttZFwB6b4K5oC',
    ],
    slicePath: ['8e99', '1372'],
    dialInterval: 10000,
  })

  // block tracker
  const blockTracker = new KsnBlockTracker(kitsunet)

  // create higher level
  const provider = providerFromMiddleware(createKitsunetMiddleware({ kitsunet }))

  // add handlers
  const networkMiddleware = mergeMiddleware([
    createKitsunetMiddleware({ kitsunet }),
    createBlockRefRewriteMiddleware({ blockTracker }),
    createSliceMiddleware({ kitsunet, depth: 10 }),
    createVmMiddleware({ provider }),
  ])

  await kitsunet.start()
  return { networkMiddleware, blockTracker }
}

function createKitsunetMiddleware ({ kitsunet }) {
  return scaffold({
    eth_getBlockByNumber: createAsyncMiddleware(async (req, res, next) => {
      const [blockRef] = req.params
      let block = null
      if (blockRef === 'latest') {
        block = await kitsunet.getLatestBlock()
      } else {
        block = await kitsunet.getBlockByNumber(blockRef, false)
      }

      if (!block) return next()
      res.result = blockToRpc(block)
    }),
    net_version: createAsyncMiddleware(async (req, res, next) => {
      res.result = MAINNET_CODE
    }),
  })
}

class KsnBlockTracker extends EE {
  constructor (client) {
    super()
    this.client = client
    this.current = null

    this.client.on('latest', (block) => {
      this.current = utils.addHexPrefix(block.header.number.toString('hex'))
      this.emit('latest', this.current)
    })

    this.client.on('sync', ({ newBlock, oldBlock }) => {
      this.emit('sync', {
        newBlock: newBlock ? utils.addHexPrefix(newBlock.header.number.toString('hex')) : '0x0',
        oldBlock: oldBlock ? utils.addHexPrefix(oldBlock.header.number.toString('hex')) : '0x0',
      })
    })
  }

  async getLatestBlock () {
    const block = await this.client.getLatestBlock()
    return utils.addHexPrefix(block.header.number.toString('hex'))
  }

  getCurrentBlock () {
    return this.current
  }
}

function blockToRpc (block) {
  const jsonBlock = block.toJSON(true)
  return {
    parentHash: jsonBlock.header.parentHash,
    sha3Uncles: jsonBlock.header.uncleHash,
    miner: jsonBlock.header.coinbase,
    stateRoot: jsonBlock.header.stateRoot,
    transactionsRoot: jsonBlock.header.transactionsTrie,
    receiptRoot: jsonBlock.header.receiptTrie || utils.SHA3_NULL,
    logsBloom: jsonBlock.header.bloom,
    difficulty: jsonBlock.header.difficulty,
    number: jsonBlock.header.number,
    gasLimit: jsonBlock.header.gasLimit,
    gasUsed: jsonBlock.header.gasUsed,
    timestamp: jsonBlock.header.timestamp,
    extraData: jsonBlock.header.extraData,
    mixHash: jsonBlock.header.mixHash,
    nonce: jsonBlock.header.nonce,
    transactions: jsonBlock.transactions,
    transactionsRoot: jsonBlock.transactionsRoot,
  }
}
