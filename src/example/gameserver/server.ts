/*import { BaseFn } from '../../sys/basefunc';
import * as network from '../../sys/network';
import * as protocol from '../protocol';

function defFunctions(server: network.WsServer){

    server.defRpc('register', (client: network.Client, reginfo: protocol.register_req)=>{
        logInfo('register' + reginfo.username +  + reginfo.passwd + + reginfo.mobile);
        return new protocol.register_resp(true, 1000);
    })

    .defRpc('login', (client: network.Client, param: protocol.login_req)=>{

    })

}

function main(){
    let server = new network.WsServer('games');
    server.on('error', (client: network.Client, err: Error)=>{

    })
    .on('newconn',  (client: network.Client)=>{

    })
    .on('disconnect', (client: network.Client)=>{

    })
    .on('start', ()=>{

    });

    defFunctions();
}

main();
*/