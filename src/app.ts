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
    ws.on('error', (client: network.Client, err: Error)=>{
        console.log('error: ' + err.message);
    })
    .on('newconn', (client: network.Client, err: Error)=>{
        console.log('newconn: ' + client);
    })
    .on('dissconnect', (client: network.Client, err: Error)=>{
        console.log('dissconnect: ' + client);
    })
    .on('start', ()=>{
        console.log('ws is runing');
    });
    ws.defRpc('test', (client: network.Client, params: any)=>{
        console.log('recv:' + JSON.stringify(params));
    })
    .start(10086);
}
main();