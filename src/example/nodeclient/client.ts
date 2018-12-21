import {BaseFn} from '../../sys/basefunc';
import {Log} from '../../sys/log';
import {WsClient, TcpClient} from '../../sys/network';
import * as P from '../protocol';

/**命令列表 */
let funcs: any = {};

/**客户端 */
let client: TcpClient = new TcpClient();

/**解析命令参数 */
function parseParam(str: string){
	let ps = str.split(' ');
	let ins = false;
	let tmp = '';
	let pars = [];
	for(let i = 0; i < ps.length; ++i){
		let s = ps[i];

        if (s[0] == '"') {
            ins = true;
        }

        if (ins) {
            tmp += (s + ' ');
        } else {
            pars.push(s);
        }

        if (s[s.length - 1] == '"' && ins) {
            ins = false;
            pars.push(tmp);
            tmp = '';
        }
    }
    return pars;
}

function defcmd(name: string, pars: number, hp: string) {
    funcs[name] = { pars: pars, func: eval(name), help: hp };
}

function help(cmd: string|null) {
    if (cmd) {
        let func = funcs[cmd];
        if (func) {
            console.log(func.help + '\r\n参数: ' + func.pars);
        }
    } else {
        let i = 0;
        for (let k in funcs) {
            let v = funcs[k];
            console.log(++i + '. ' + k + (k == 'help' ? ': '+ v.help : '.'));
        }
    }
}

function defcmds(){
    defcmd('help', 1, 'help cmd');
    defcmd('connect', 1, 'connect ws://127.0.0.1:10086/games');
    defcmd('login', 2, 'login name passwd');
    defcmd('regist', 2, 'regist name passwd');
    defcmd('chat', 1, 'chat xxxxxxx');
}

/**连接服务器 */
function connect(url: string){
    client.on('connected', ()=>{
        logDeb('connect success!');
    });
    client.connect(url, 10086);
}

/**登录 */
function login(name: string, passwd: string){
    client.rpc(new P.Login_req(name, passwd), (err: any, ret: P.Login_resp)=>{
        if (!err){
            logInfo('login result: ' + ret.code);
        }
    });
}

function regist(name: string, passwd: string){
    client.rpc(new P.register_req(name, passwd), (err: any, ret: P.register_resp)=>{
        if (!err){
            logInfo('regist result: ' + ret.code);
        }
    });
}

function chat(msg: string){
    client.sendMsg(new P.Chat(msg || 'null'));
}

function main(){
    let tip = 'chat:>';
    Log.createSingleton();
    // 注册命令
    defcmds();

    process.stdin.setEncoding('utf8');

    // 读取输入指令并执行
    process.stdin.on('readable', () => {
        let chunk = process.stdin.read();
        if (chunk !== null) {

            // 读取输入并解析命令和参数
            let cmd = parseParam(BaseFn.trimlr(chunk.toString()));
            let func = funcs[cmd[0]];
            if (func) {
                if (cmd.length < func.pars) {
                    console.log('参数不足' + func.pars + '个');
                    process.stdout.write(tip);
                    return;
                }

                let pars = [];
                let tmp = '';
                for (let i = 0; i < cmd.length - 1; ++i) {
                    if (i <= func.pars - 1) {
                        pars.push(cmd[i + 1]);
                    } else {
                        tmp += (cmd[i + 1] + ' ');
                    }
                }

                if (tmp != '')
                    pars.push(tmp);

                // 执行命令 
                func.func.apply(null, pars);
            } else {
                if (cmd[0] != '')
                    console.log('未注册的命令: ' + cmd[0]);
            }

            process.stdout.write(tip);
        }
        process.stdin.resume();
    });

    process.stdin.on('end', () => {
        process.stdout.write('end');
    });

    process.stdout.write(tip);

    client.router(P.ChatSync, (msg: P.ChatSync)=>{
        logDeb(msg.chatMsg[0]);
    })
    .router(P.UserinfoSync, (msg: P.UserinfoSync)=>{
        logDeb(JSON.stringify(msg));
    });

    client.on('error', (err:any)=>{
        logErr(err.message);
    })
    .on('disconnect', ()=>{
        logWran('连接断开');
    });
}

main();