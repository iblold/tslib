import {HYHttpServer} from '../../sys/httpserver';
import {Log} from '../../sys/log';

function main(){
    Log.createSingleton();
    let server = new HYHttpServer();
    if (server.init('./js/example/h5client/web.json')){
        server.start(()=>{

        });
    }
}

main();