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

// ===== 加载本地 balances.json 和 tokens.json，全部全局小写 =====
let balances = {};
let tokens = {};
const BALANCE_FILE = path.join(__dirname, 'public', 'balances.json');
const TOKEN_FILE = path.join(__dirname, 'public', 'tokens.json');

// 加载 balances
function loadBalances() {
  if (fs.existsSync(BALANCE_FILE)) {
    balances = JSON.parse(fs.readFileSync(BALANCE_FILE));
  } else {
    balances = {};
  }
}
function saveBalances() {
  fs.writeFileSync(BALANCE_FILE, JSON.stringify(balances, null, 2));
}
loadBalances();

// 加载 tokens
function loadTokens() {
  if (fs.existsSync(TOKEN_FILE)) {
    tokens = JSON.parse(fs.readFileSync(TOKEN_FILE));
  } else {
    tokens = {};
  }
}
function saveTokens() {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}
loadTokens();

// ===== 钱包RPC核心接口 =====
const CHAIN_ID = 1; // 这里写你的链ID，MetaMask自定义节点里填什么就写什么

app.post('/', (req, res) => {
  const { method, params, id } = req.body;
  console.log('钱包请求:', method, params);

  // --- 新增：返回链ID ---
  if (method === 'eth_chainId') {
    return res.json({ jsonrpc: "2.0", id, result: "0x" + CHAIN_ID.toString(16) });
  }
  if (method === 'net_version') {
    return res.json({ jsonrpc: "2.0", id, result: CHAIN_ID.toString() });
  }

  // 1. 主币ETH余额，钱包请求格式 {"method":"eth_getBalance","params":["0x地址","latest"]}
  if (method === 'eth_getBalance') {
    const addr = params[0].toLowerCase();           // 钱包地址全小写
    let value = (balances[addr] && balances[addr]['eth']) ? balances[addr]['eth'] : "0"; // 主币必须用"eth"小写
    value = BigInt(value) * BigInt(1e18);           // 金额转成Wei单位（假设后台是整数ETH）
    return res.json({ jsonrpc: "2.0", id, result: "0x" + value.toString(16) });
  }

  // 2. 代币合约balanceOf，钱包请求格式 eth_call
  if (method === 'eth_call') {
    const to = params[0].to?.toLowerCase?.() || "";   // 合约地址小写
    const data = params[0].data.toLowerCase();
    if (data.startsWith('0x70a08231')) {
      const queriedAddr = '0x' + data.slice(-40).toLowerCase();
      let value = (balances[queriedAddr] && balances[queriedAddr][to]) ? balances[queriedAddr][to] : "0";
      const decimals = tokens[to]?.decimals || 18;
      let resVal = BigInt(value) * BigInt(10 ** decimals);
      return res.json({ jsonrpc: "2.0", id, result: "0x" + resVal.toString(16) });
    }
    if (data === '0x95d89b41') {
      const symbol = tokens[to]?.symbol || "TOKEN";
      let hex = Buffer.from(symbol, 'utf8').toString('hex');
      hex = hex.padEnd(64, '0');
      return res.json({ jsonrpc: "2.0", id, result: '0x' + hex });
    }
    if (data === '0x313ce567') {
      const decimals = tokens[to]?.decimals || 18;
      let hex = decimals.toString(16).padStart(64, '0');
      return res.json({ jsonrpc: "2.0", id, result: '0x' + hex });
    }
    if (data === '0x06fdde03') {
      const name = tokens[to]?.name || "Fake Token";
      let hex = Buffer.from(name, 'utf8').toString('hex');
      hex = hex.padEnd(64, '0');
      return res.json({ jsonrpc: "2.0", id, result: '0x' + hex });
    }
    return res.json({ jsonrpc: "2.0", id, result: '0x' });
  }

  // 3. 其它请求，默认返回0
  res.json({ jsonrpc: "2.0", id, result: "0x0" });
});

// ==== 后台API不变 ====
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
  balances[addr][symbol.toLowerCase()] = amount; // 这里确保币种/合约都小写
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
