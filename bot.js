require('dotenv').config();
const ethers = require('ethers');
const web3 = require('web3');
const fs = require('fs')

const BUY_AMOUNT = '0.001';
const PHRASE = process.env.PHRASE;

let ROUTER;
let FACTORY;
let WBNB;
let ACCOUNT;
let ADDRESS;
let PROVIDER;

const approve_wbnb = async () =>{
    if(WBNB && ACCOUNT){
        const balance = await ACCOUNT.getBalance();
        WBNB.approve(
            process.env.PANCAKE_ROUTER_ADDRESS,
            balance.toString()
        )
            .then((tx) =>{
                tx.wait()
                    .then((receipt) =>{
                        console.log("****** WBNB APPROVED! ******");
                        start_search_for_new_tokens();
                    })
                    .catch((err) =>{
                        throw new Error("WBNB not approved!");
                    })
            })
            .catch((err) =>{
                throw new Error(err.message);
            });
    }else{
        throw new Error('No WBNB contract created!');
    }
}

const setup_connections_and_contracts = async () =>{
    PROVIDER = new ethers.providers.WebSocketProvider(process.env.WEB_SOCKET_ADDRESS);
    const wallet = ethers.Wallet.fromMnemonic(PHRASE);
    ACCOUNT = wallet.connect(PROVIDER);
    ADDRESS = ACCOUNT.getAddress();


    FACTORY = new ethers.Contract(
        process.env.PANCAKE_FACTORY_ADDRESS,
        ['event PairCreated(address indexed token0, address indexed token1, address pair, uint)'],
        ACCOUNT
    );

    ROUTER = new ethers.Contract(
        process.env.PANCAKE_ROUTER_ADDRESS,
        [
            'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
            'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
        ],
        ACCOUNT
    );

    WBNB = new ethers.Contract(
        process.env.WBNB_ADDRESS,
        [
            'function approve(address spender, uint amount) public returns(bool)',
        ],
        ACCOUNT
    );

    await approve_wbnb();
}

const buy_token = async (tokenIn, tokenOut) => {
    const amountIn = ethers.utils.parseUnits(BUY_AMOUNT, 'ether');
    ROUTER.getAmountsOut(amountIn, [process.env.WBNB_ADDRESS, tokenOut])
        .then(async (amounts) =>{
            const amountOutMin = amounts[1].sub(amounts[1].div(10));
            console.log(`****** Buying token: ${tokenOut}! ******`);

            ROUTER.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                [tokenIn, tokenOut],
                ADDRESS,
                Math.floor(Date.now() / 1000) + 60 * 10,
                {gasLimit: ethers.utils.hexlify(6000000), gasPrice: ethers.utils.parseUnits('12', 'gwei')}
            )
                .then((tx) =>{
                    tx.wait()
                        .then((receipt) =>{
                            fs.writeFile('./buys.txt', `${tokenOut} | ${amountOutMin} | PURCHASED! \n`, { flag: 'a+' }, err =>{
                                throw Error(err);
                            });
                            console.log("****** Buy Success! ******")
                        })
                        .catch((err) =>{
                            fs.writeFile('./buys.txt', `${tokenOut} | ${amountOutMin} | NOT PURHCASED! \n`, { flag: 'a+' }, err =>{
                                throw Error(err);
                            })
                            console.log(err);
                        })
                })
                .catch((err) =>{
                    console.log(err);
                })
        })
        .catch((err) =>{
            console.log("****** Insuficient Liquidity! ******");
        })
}

const start_search_for_new_tokens = () =>{
    FACTORY.on('PairCreated', async (token0, token1, pairAddress) =>{
        console.log('****** New Pair Detected! ******')

        let tokenIn, tokenOut;
        if(token0.toLowerCase() === process.env.WBNB_ADDRESS.toLowerCase()){
            tokenIn = token0;
            tokenOut = token1;
        }

        if(token1.toLowerCase() === process.env.WBNB_ADDRESS.toLowerCase()){
            tokenIn = token1;
            tokenOut = token0;
        }

        if(!tokenIn){
            console.log('****** Invalid Pair! ******');
        }else{
            console.log('****** Starting Buy! ******')
            await buy_token(tokenIn, tokenOut);
        }
    })
}

setup_connections_and_contracts();

