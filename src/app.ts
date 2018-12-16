import { HYHttpServer } from './sys/httpserver';
import { Log } from './sys/log';
import * as network from './sys/network';


function main(){
    Log.createSingleton();
    let server = new HYHttpServer();
    if(server.init('./web.json')){
        server.start(()=>{});
    }
   
}
main();