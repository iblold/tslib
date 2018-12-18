import { HYHttpServer } from './sys/httpserver';
import { Log } from './sys/log';
import * as network from './sys/network';


function main(){
    Log.createSingleton();
    let server = new HYHttpServer();
    if(server.init('./web.json')){
        server.start(()=>{});
    }

    let ws = new network.WsServer('games');
    ws.on('error', (client: network.WsClient, err: Error)=>{
        logInfo('error: ' + err.message);
    })
    .on('newconn', (client: network.WsClient, err: Error)=>{
        logInfo('newconn: ' + client);
    })
    .on('dissconnect', (client: network.WsClient, err: Error)=>{
        logInfo('dissconnect: ' + client);
    })
    .on('start', ()=>{
        logInfo('ws is runing');
    })
    ws.defRpc('test', (client: network.Client, params: any)=>{
        logInfo('recv:' + JSON.stringify(params));
        return {r:params.p + 2000};
    })
    .start(10086);
}
main();