const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const BALANCE_FILE = path.join(__dirname, 'public', 'balances.json');
const TOKEN_FILE = path.join(__dirname, 'public', 'tokens.json');

let balances = {};
let tokens = {};

function loadBalances() {
  if (fs.existsSync(BALANCE_FILE)) {
    balances = JSON.parse(fs.readFileSync(BALANCE_FILE));
  } else {
    balances = {};
  }
}
function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  } else {
    tokens = {};
  }
}
function saveBalances() {
  fs.writeFileSync(BALANCE_FILE, JSON.stringify(balances, null, 2));
}
function saveTokens() {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}
loadBalances();
loadTokens();

app.get('/', (req, res) => {
  res.send('Fake EVM JSON-RPC server running.');
});

// JSON-RPC 核心接口，钱包连节点用
app.post('/', (req, res) => {
console.log('钱包请求：', JSON.stringify(req.body));
  const { method, params, id } = req.body;

  // 查询主币余额（如ETH、ETC等，symbol通过tokens.json管理）
  if (method === 'eth_getBalance') {
    const addr = params[0].toLowerCase();
    // 默认主币符号从 tokens.json 的 "native" 读取
    const coin = tokens.native?.symbol || 'ETH';
    let value = (balances[addr] && balances[addr][coin]) ? balances[addr][coin] : "0";
    value = BigInt(value) * BigInt(1e18);
    return res.json({ jsonrpc: "2.0", id, result: "0x" + value.toString(16) });
  }

  // erc20合约合规查询
  if(method === 'eth_call') {
    const to = params[0].to?.toLowerCase?.() || "";
    const data = params[0].data.toLowerCase();
    // 读取 balanceOf(address)
    if(data.startsWith('0x70a08231')) {
      const queriedAddr = '0x' + data.slice(-40);
      let value = (balances[queriedAddr] && balances[queriedAddr][to]) ? balances[queriedAddr][to] : "0";
      const decimals = tokens[to]?.decimals || 18;
      let resVal = BigInt(value) * BigInt(10 ** decimals);
      return res.json({ jsonrpc: "2.0", id, result: "0x" + resVal.toString(16) });
    }
    // symbol()
    if (data === '0x95d89b41') {
      const symbol = tokens[to]?.symbol || "TOKEN";
      let hex = Buffer.from(symbol, 'utf8').toString('hex');
      hex = hex.padEnd(64, '0');
      return res.json({ jsonrpc: "2.0", id, result: '0x' + hex });
    }
    // decimals()
    if (data === '0x313ce567') {
      const decimals = tokens[to]?.decimals || 18;
      let hex = decimals.toString(16).padStart(64, '0');
      return res.json({ jsonrpc: "2.0", id, result: '0x' + hex });
    }
    // name()
    if (data === '0x06fdde03') {
      const name = tokens[to]?.name || "Fake Token";
      let hex = Buffer.from(name, 'utf8').toString('hex');
      hex = hex.padEnd(64, '0');
      return res.json({ jsonrpc: "2.0", id, result: '0x' + hex });
    }
    return res.json({ jsonrpc: "2.0", id, result: '0x' });
  }

  res.json({ jsonrpc: "2.0", id, result: "0x" });
});

// 管理API，前端UI通过
app.get('/api/list', (req, res) => {
  loadBalances();
  loadTokens();
  res.json({ balances, tokens });
});
app.post('/api/set', (req, res) => {
  const { address, symbol, amount } = req.body;
  if (!address || !symbol || amount === undefined) return res.status(400).json({ error: "param missing" });
  const addr = address.toLowerCase();
  if (!balances[addr]) balances[addr] = {};
  balances[addr][symbol] = amount;
  saveBalances();
  res.json({ ok: true });
});
app.post('/api/delete', (req, res) => {
  const { address } = req.body;
  const addr = address.toLowerCase();
  delete balances[addr];
  saveBalances();
  res.json({ ok: true });
});
app.post('/api/settoken', (req, res) => {
  const { contract, symbol, name, decimals } = req.body;
  if (!contract || !symbol || decimals === undefined) return res.status(400).json({ error: "param missing" });
  tokens[contract.toLowerCase()] = { symbol, name, decimals };
  saveTokens();
  res.json({ ok: true });
});

app.listen(PORT, () => console.log('Fake EVM server running at http://localhost:' + PORT));
